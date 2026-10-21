# Quick health report: version, scheduled tasks, server, database, latest backup, recent errors.
param([int]$Port = 0)

. "$PSScriptRoot\common.ps1"
$ErrorActionPreference = 'Continue'

$settings = Read-DotEnv
if ($Port -eq 0) { $Port = 8000; if ($settings['PORT']) { $Port = [int]$settings['PORT'] } }

$version = 'unknown'
if (Test-Path (Join-Path $KardexRoot 'VERSION')) { $version = (Get-Content (Join-Path $KardexRoot 'VERSION')).Trim() }
Write-Step "Kardex $version at $KardexRoot"

if ($OnWindows) {
    foreach ($name in @($ServerTaskName, $BackupTaskName)) {
        $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if ($task) {
            $info = Get-ScheduledTaskInfo -TaskName $name
            Write-Ok ("task '{0}': {1}, last run {2} (result {3})" -f $name, $task.State, $info.LastRunTime, $info.LastTaskResult)
        } else { Write-Warn "task '$name' not registered - run install.bat" }
    }
}

try {
    $tables = @(Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v1/tables" -TimeoutSec 5)
    Write-Ok ("server + database OK: {0} table(s)" -f $tables.Count)
    foreach ($t in $tables) { Write-Host ("        {0}: {1} rounds" -f $t.name, $t.total_rounds) }
} catch {
    Write-Warn "server not answering on port ${Port}: $($_.Exception.Message)"
}

$backupDir = $settings['KARDEX_BACKUP_DIR']
if (-not $backupDir) { $backupDir = $DefaultBackupDir }
$latest = Get-ChildItem -Path $backupDir -Filter 'kardex-*.dump' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) {
    $age = (Get-Date) - $latest.LastWriteTime
    $line = "latest backup: $($latest.Name) ($([math]::Round($latest.Length / 1KB)) KB, $([math]::Floor($age.TotalHours)) h ago)"
    if ($age.TotalHours -gt 36) { Write-Warn $line } else { Write-Ok $line }
} else { Write-Warn "no backups in $backupDir yet" }

$errLog = Get-ChildItem -Path $LogDir -Filter 'server-*.err.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($errLog) {
    $errors = Select-String -Path $errLog.FullName -Pattern 'ERROR|Traceback' -SimpleMatch:$false | Select-Object -Last 5
    if ($errors) { Write-Warn "recent errors in $($errLog.Name):"; $errors | ForEach-Object { Write-Host "        $($_.Line)" } }
    else { Write-Ok "no errors in $($errLog.Name)" }
}
