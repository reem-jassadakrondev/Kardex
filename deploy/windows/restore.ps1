# Restores a backup made by backup.ps1, replacing ALL current Kardex data. Stops the server while
# restoring and starts it again afterwards.
#   .\restore.ps1 -File C:\Kardex\backups\kardex-20261018-030000.dump
param(
    [Parameter(Mandatory = $true)][string]$File,
    [string]$PgBin = '',
    [switch]$Force
)

. "$PSScriptRoot\common.ps1"

if (-not (Test-Path $File)) { throw "Backup file not found: $File" }
$db = Get-DbConnection
$pgRestore = Get-PgTool (Find-PgBin $PgBin) 'pg_restore'

if (-not $Force) {
    Write-Host "This REPLACES all data in database '$($db.Database)' with $File" -ForegroundColor Yellow
    $answer = Read-Host 'Type RESTORE to continue'
    if ($answer -ne 'RESTORE') { Write-Host 'Cancelled.'; exit 1 }
}

Write-Step 'Stopping server'
Stop-KardexServer

Write-Step "Restoring $File"
$env:PGPASSWORD = $db.Password
try {
    & $pgRestore --clean --if-exists --no-owner --single-transaction --exit-on-error `
        --host $db.Host --port $db.Port --username $db.User --dbname $db.Database $File
    if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE (database left unchanged)" }
    Write-Ok 'restored'
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Write-Step 'Starting server'
    Start-KardexServer
}
