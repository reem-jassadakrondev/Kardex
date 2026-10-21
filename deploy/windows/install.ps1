# Installs (or re-installs) Kardex on this machine. Safe to run again: keeps backend\.env and data.
#
#   Right-click install.bat -> Run as administrator      (or, in an admin PowerShell:)
#   powershell -ExecutionPolicy Bypass -File install.ps1 [-Port 8000] [-BackupCopyDir D:\KardexBackup]
#
# Needs: PostgreSQL 15+ (service running) and Python 3.12 installed - see INSTALL.md.
param(
    [int]$Port = 8000,
    [string]$Python = '',            # python 3.12 executable; default: py -3.12
    [string]$PgBin = '',             # PostgreSQL bin folder; default: newest under C:\Program Files\PostgreSQL
    [string]$DbHost = 'localhost',
    [int]$DbPort = 5432,
    [string]$PostgresUser = 'postgres',
    [string]$PostgresPassword = '',  # superuser password, only needed on first install; prompted if empty
    [string]$DbName = 'kardex',
    [string]$DbUser = 'kardex',
    [string]$BackupCopyDir = '',     # optional second backup location (cloud-synced folder / USB)
    [string]$BackupTime = '03:00',
    [switch]$KeepSleep,              # don't change the power plan (default: never sleep/hibernate on AC power)
    [switch]$SkipTasks               # don't touch firewall / scheduled tasks (testing on non-Windows)
)

. "$PSScriptRoot\common.ps1"

function Assert-Admin {
    if (-not $OnWindows -or $SkipTasks) { return }
    $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run as Administrator (right-click install.bat -> Run as administrator).'
    }
}

function Find-Python312 {
    if ($Python) { $candidates = @(, @($Python)) }
    elseif ($OnWindows) { $candidates = @(, @('py', '-3.12')) }
    else { $candidates = @(, @('python3.12')) }
    foreach ($cmd in $candidates) {
        try {
            $exe = $cmd[0]
            $rest = @($cmd | Select-Object -Skip 1)
            $out = & $exe @rest -c 'import sys; print(sys.version_info[:2] == (3, 12)); print(sys.executable)' 2>$null
            if ($LASTEXITCODE -eq 0 -and $out[0] -eq 'True') { return $out[1] }
        } catch { }
    }
    throw 'Python 3.12 not found. Install python-3.12.10-amd64.exe (see INSTALL.md) or pass -Python C:\path\python.exe'
}

function New-Password([int]$Length = 24) {
    # Letters and digits only: safe inside a URL, SQL literal and .env without escaping.
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'.ToCharArray()
    $bytes = New-Object byte[] $Length
    $rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
    $rng.GetBytes($bytes)
    $result = ''
    foreach ($b in $bytes) { $result += $chars[$b % $chars.Length] }
    return $result
}

function Read-Secret([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Invoke-Psql([string]$Psql, [string]$Sql) {
    $out = & $Psql --host $DbHost --port $DbPort --username $PostgresUser --dbname postgres `
        --no-psqlrc --tuples-only --no-align -v ON_ERROR_STOP=1 --command $Sql
    if ($LASTEXITCODE -ne 0) { throw "psql failed: $Sql" }
    return "$out".Trim()
}

function Initialize-Database([string]$Psql) {
    if (-not $PostgresPassword) { $script:PostgresPassword = Read-Secret "Password of PostgreSQL user '$PostgresUser'" }
    $appPassword = New-Password
    $env:PGPASSWORD = $PostgresPassword
    try {
        if ((Invoke-Psql $Psql "SELECT 1 FROM pg_roles WHERE rolname = '$DbUser'") -eq '1') {
            Invoke-Psql $Psql "ALTER ROLE $DbUser WITH LOGIN PASSWORD '$appPassword'" | Out-Null
            Write-Ok "role $DbUser exists - password reset for the new .env"
        } else {
            Invoke-Psql $Psql "CREATE ROLE $DbUser LOGIN PASSWORD '$appPassword'" | Out-Null
            Write-Ok "created role $DbUser"
        }
        if ((Invoke-Psql $Psql "SELECT 1 FROM pg_database WHERE datname = '$DbName'") -eq '1') {
            Invoke-Psql $Psql "ALTER DATABASE $DbName OWNER TO $DbUser" | Out-Null
            Write-Ok "database $DbName exists - owner set to $DbUser"
        } else {
            Invoke-Psql $Psql "CREATE DATABASE $DbName OWNER $DbUser ENCODING 'UTF8' TEMPLATE template0" | Out-Null
            Write-Ok "created database $DbName"
        }
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    return $appPassword
}

function Write-EnvFile([string]$AppPassword) {
    $lines = @(
        "DATABASE_URL=""postgresql+asyncpg://${DbUser}:${AppPassword}@${DbHost}:${DbPort}/${DbName}""",
        'APP_ENV=production',
        "PORT=$Port"
    )
    if ($BackupCopyDir) { $lines += "KARDEX_BACKUP_COPY_DIR=""$BackupCopyDir""" }
    Write-Utf8NoBom $EnvFile (($lines -join "`r`n") + "`r`n")
    Write-Ok "wrote $EnvFile"
}

function Register-KardexTasks {
    $ps = 'powershell.exe'
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable `
        -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

    $serverAction = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $BackendDir `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File ""$PSScriptRoot\run-server.ps1"""
    Register-ScheduledTask -TaskName $ServerTaskName -Action $serverAction -Trigger (New-ScheduledTaskTrigger -AtStartup) `
        -Principal $principal -Settings $settings -Description "Kardex web server (API + app) on port $Port" -Force | Out-Null
    Write-Ok "task '$ServerTaskName' (at startup)"

    $backupAction = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $KardexRoot `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File ""$PSScriptRoot\backup.ps1"""
    $backupSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable -AllowStartIfOnBatteries
    Register-ScheduledTask -TaskName $BackupTaskName -Action $backupAction -Trigger (New-ScheduledTaskTrigger -Daily -At $BackupTime) `
        -Principal $principal -Settings $backupSettings -Description 'Kardex daily database backup' -Force | Out-Null
    Write-Ok "task '$BackupTaskName' (daily $BackupTime; runs later if the machine was off)"
}

function Open-Firewall {
    $name = "Kardex (TCP $Port)"
    Get-NetFirewallRule -DisplayName 'Kardex (TCP *' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
    Write-Ok "firewall: inbound TCP $Port allowed"
}

function Disable-Sleep {
    # A desktop Windows (10/11) sleeps after idle by default; asleep, the server stops answering the iPads.
    # AC power only: a laptop on battery may still sleep. The display may still turn off.
    powercfg /change standby-timeout-ac 0 | Out-Null
    powercfg /change hibernate-timeout-ac 0 | Out-Null
    Write-Ok 'power: never sleep / hibernate on AC power'
}

function Show-Urls {
    $ips = @()
    if ($OnWindows) {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $_.IPAddress }
    }
    Write-Host ''
    Write-Host 'Kardex is installed. Open on iPads / phones on the same network:' -ForegroundColor Green
    foreach ($ip in $ips) { Write-Host "    http://${ip}:$Port/" -ForegroundColor Green }
    Write-Host "    (on this machine: http://localhost:$Port/)"
}

# --- main ---------------------------------------------------------------------------------------

Assert-Admin
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Re-install/update: keep the port already in backend\.env unless -Port was given explicitly.
$existingPort = (Read-DotEnv)['PORT']
if ($existingPort -and -not $PSBoundParameters.ContainsKey('Port')) { $Port = [int]$existingPort }

Write-Step 'Checking prerequisites'
$python312 = Find-Python312
Write-Ok "Python 3.12: $python312"
$pgBinDir = Find-PgBin $PgBin
$psql = Get-PgTool $pgBinDir 'psql'
Write-Ok "PostgreSQL tools: $pgBinDir"
if (-not (Test-Path (Join-Path $KardexRoot 'frontend\dist\index.html'))) {
    Write-Warn 'frontend\dist\index.html missing - the API will run but the app page will not be served.'
}

Write-Step 'Python environment'
$venvPython = Get-VenvPython
if (-not (Test-Path $venvPython)) {
    & $python312 -m venv (Join-Path $BackendDir 'venv')
    if ($LASTEXITCODE -ne 0) { throw 'creating the virtualenv failed' }
}
$pipArgs = @('-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', (Join-Path $BackendDir 'requirements.txt'))
$wheels = Join-Path $KardexRoot 'wheels'
$installed = $false
if (Test-Path $wheels) {
    # Exactly the versions tested on the dev machine, no internet needed.
    & $venvPython @pipArgs --no-index --find-links $wheels
    $installed = ($LASTEXITCODE -eq 0)
    if (-not $installed) { Write-Warn 'bundled wheels incomplete for this machine - falling back to PyPI' }
}
if (-not $installed) {
    & $venvPython @pipArgs
    if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }
}
Write-Ok 'packages installed'

Write-Step 'Database'
if (Test-Path $EnvFile) {
    Write-Ok "keeping existing $EnvFile"
} else {
    $appPassword = Initialize-Database $psql
    Write-EnvFile $appPassword
}

Write-Step 'Migrating schema'
if ($OnWindows -and -not $SkipTasks) { Stop-KardexServer }
Push-Location $BackendDir
try {
    & $venvPython -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'alembic upgrade failed' }
} finally { Pop-Location }
Write-Ok 'schema up to date'

if ($OnWindows -and -not $SkipTasks) {
    Write-Step 'Windows services'
    Open-Firewall
    if (-not $KeepSleep) { Disable-Sleep }
    Register-KardexTasks
    Start-KardexServer
    if (Wait-KardexHealthy $Port 60) { Write-Ok "server answering on port $Port" }
    else { Write-Warn "server not answering yet - check $LogDir" }
} else {
    Write-Warn 'skipped firewall and scheduled tasks; start the server with run-server.ps1'
}

Show-Urls
