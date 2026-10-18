# Shared helpers for the Kardex Windows scripts. Dot-source it: . "$PSScriptRoot\common.ps1"
# Must run on Windows PowerShell 5.1 (Windows Server 2016): no `??`, no ternary, no `&&`.

$ErrorActionPreference = 'Stop'

$OnWindows = ($env:OS -eq 'Windows_NT')
$KardexRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BackendDir = Join-Path $KardexRoot 'backend'
$EnvFile = Join-Path $BackendDir '.env'
$LogDir = Join-Path $KardexRoot 'logs'
$DefaultBackupDir = Join-Path $KardexRoot 'backups'
$ServerTaskName = 'Kardex Server'
$BackupTaskName = 'Kardex Backup'
$ExeSuffix = ''
if ($OnWindows) { $ExeSuffix = '.exe' }

function Get-Stamp([string]$Format) {
    # Invariant culture: on Thai-locale Windows, Get-Date -Format yields Buddhist years (2569).
    return (Get-Date).ToString($Format, [Globalization.CultureInfo]::InvariantCulture)
}

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "    !!  $Message" -ForegroundColor Yellow }

function Get-VenvPython {
    if ($OnWindows) { return Join-Path $BackendDir 'venv\Scripts\python.exe' }
    return Join-Path $BackendDir 'venv/bin/python'
}

function Find-PgBin([string]$Hint) {
    # PostgreSQL bin folder: explicit hint, KARDEX_PG_BIN, else the newest standard install.
    if ($Hint) { return $Hint }
    if ($env:KARDEX_PG_BIN) { return $env:KARDEX_PG_BIN }
    $candidates = @()
    if ($OnWindows) {
        $candidates = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue
    } else {
        $candidates = Get-ChildItem '/Library/PostgreSQL/*/bin/pg_dump' -ErrorAction SilentlyContinue
    }
    $best = $candidates | Sort-Object { [int]($_.Directory.Parent.Name -replace '[^\d].*$', '') } -Descending | Select-Object -First 1
    if (-not $best) { throw 'PostgreSQL not found. Install it (see INSTALL.md) or pass -PgBin "C:\Program Files\PostgreSQL\16\bin".' }
    return $best.Directory.FullName
}

function Get-PgTool([string]$PgBin, [string]$Name) {
    $path = Join-Path $PgBin ($Name + $ExeSuffix)
    if (-not (Test-Path $path)) { throw "$path not found" }
    return $path
}

function Read-DotEnv {
    $values = @{}
    if (-not (Test-Path $EnvFile)) { return $values }
    foreach ($line in [IO.File]::ReadAllLines($EnvFile)) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    return $values
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    # PowerShell 5.1's Out-File/Set-Content add a BOM, which python-dotenv would read as part of the first key.
    [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding $false))
}

function Get-DbConnection {
    # Parse DATABASE_URL (postgresql+asyncpg://user:pass@host:port/db) from backend\.env.
    $url = (Read-DotEnv)['DATABASE_URL']
    if (-not $url) { throw "DATABASE_URL missing in $EnvFile - run install first." }
    if ($url -notmatch '^postgresql(\+\w+)?://([^:]+):([^@]*)@([^:/]+)(:(\d+))?/([^?]+)') { throw "Unsupported DATABASE_URL format in $EnvFile" }
    $port = '5432'
    if ($Matches[6]) { $port = $Matches[6] }
    return @{
        User = [Uri]::UnescapeDataString($Matches[2])
        Password = [Uri]::UnescapeDataString($Matches[3])
        Host = $Matches[4]
        Port = $port
        Database = $Matches[7]
    }
}

function Stop-KardexServer {
    # Stop the supervising task first (it would restart uvicorn), then the uvicorn process itself.
    if ($OnWindows -and (Get-ScheduledTask -TaskName $ServerTaskName -ErrorAction SilentlyContinue)) {
        Stop-ScheduledTask -TaskName $ServerTaskName
    }
    $pidFile = Join-Path $LogDir 'server.pid'
    if (Test-Path $pidFile) {
        $serverPid = [int](Get-Content $pidFile)
        Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
        Remove-Item $pidFile -ErrorAction SilentlyContinue
    }
}

function Start-KardexServer {
    if ($OnWindows -and (Get-ScheduledTask -TaskName $ServerTaskName -ErrorAction SilentlyContinue)) {
        Start-ScheduledTask -TaskName $ServerTaskName
    } else {
        Write-Warn "Task '$ServerTaskName' not registered - start run-server.ps1 manually."
    }
}

function Wait-KardexHealthy([int]$Port, [int]$Seconds = 60) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/v1/health" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { return $true }
        } catch { Start-Sleep -Seconds 2 }
    }
    return $false
}
