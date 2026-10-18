# Dumps the Kardex database to backups\kardex-<timestamp>.dump (pg_dump custom format) and keeps the
# newest $RetentionDays days. Also copies the dump to KARDEX_BACKUP_COPY_DIR (from backend\.env or
# -CopyDir), e.g. a cloud-synced folder or a USB drive; a missing copy target is a warning, not an error.
# Runs daily from the "Kardex Backup" scheduled task.
param(
    [string]$PgBin = '',
    [string]$BackupDir = '',
    [string]$CopyDir = '',
    [int]$RetentionDays = 30
)

. "$PSScriptRoot\common.ps1"

$settings = Read-DotEnv
if (-not $BackupDir) { $BackupDir = $settings['KARDEX_BACKUP_DIR'] }
if (-not $BackupDir) { $BackupDir = $DefaultBackupDir }
if (-not $CopyDir) { $CopyDir = $settings['KARDEX_BACKUP_COPY_DIR'] }

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$log = Join-Path $LogDir 'backup.log'

$db = Get-DbConnection
$pgDump = Get-PgTool (Find-PgBin $PgBin) 'pg_dump'
$file = Join-Path $BackupDir ("kardex-{0}.dump" -f (Get-Stamp 'yyyyMMdd-HHmmss'))

Write-Step "Backing up database '$($db.Database)' to $file"
$env:PGPASSWORD = $db.Password
try {
    & $pgDump --format=custom --no-owner --host $db.Host --port $db.Port --username $db.User --file $file $db.Database
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
} catch {
    Add-Content -Path $log -Value "$(Get-Stamp 's') FAILED $_"
    throw
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
$sizeKb = [math]::Round((Get-Item $file).Length / 1KB)
Write-Ok "$sizeKb KB"
Add-Content -Path $log -Value "$(Get-Stamp 's') OK $file ($sizeKb KB)"

$cutoff = (Get-Date).AddDays(-$RetentionDays)
$old = Get-ChildItem -Path $BackupDir -Filter 'kardex-*.dump' | Where-Object { $_.LastWriteTime -lt $cutoff }
foreach ($item in $old) { Remove-Item $item.FullName }
if ($old) { Write-Ok "removed $(@($old).Count) backup(s) older than $RetentionDays days" }

if ($CopyDir) {
    try {
        New-Item -ItemType Directory -Force -Path $CopyDir | Out-Null
        Copy-Item -Path $file -Destination $CopyDir
        Write-Ok "copied to $CopyDir"
        Add-Content -Path $log -Value "$(Get-Stamp 's') copied to $CopyDir"
    } catch {
        Write-Warn "could not copy to $CopyDir ($_) - the local backup is still in $BackupDir"
        Add-Content -Path $log -Value "$(Get-Stamp 's') COPY FAILED $CopyDir $_"
    }
}
