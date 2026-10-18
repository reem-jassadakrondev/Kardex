# Updates an existing install (default C:\Kardex) from THIS extracted package, keeping data and settings.
#   1. extract the new kardex-<version>.zip anywhere   2. run its update.bat as administrator
# Steps: backup -> stop server -> replace program files -> install.ps1 (packages, migration, tasks, start).
# Kept as-is in the install folder: backend\.env, backend\venv, logs\, backups\.
param(
    [string]$InstallDir = 'C:\Kardex',
    [switch]$SkipBackup,
    [switch]$SkipTasks
)

$ErrorActionPreference = 'Stop'
$package = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$InstallDir = (Resolve-Path $InstallDir).Path
if ($package -eq $InstallDir) { throw 'Run update from the NEW extracted package, not from the install folder.' }
if (-not (Test-Path (Join-Path $InstallDir 'backend\.env'))) { throw "$InstallDir is not a Kardex install (backend\.env missing). Use install.bat for a new install." }

$fromVersion = 'unknown'
if (Test-Path (Join-Path $InstallDir 'VERSION')) { $fromVersion = (Get-Content (Join-Path $InstallDir 'VERSION')).Trim() }
$toVersion = (Get-Content (Join-Path $package 'VERSION')).Trim()
Write-Host "==> Updating $InstallDir from $fromVersion to $toVersion" -ForegroundColor Cyan

if (-not $SkipBackup) {
    Write-Host '==> Backup before update' -ForegroundColor Cyan
    & (Join-Path $InstallDir 'deploy\windows\backup.ps1')
}

. (Join-Path $InstallDir 'deploy\windows\common.ps1')
Write-Step 'Stopping server'
if (-not $SkipTasks) { Stop-KardexServer }

Write-Step 'Replacing program files'
# Folders replaced wholesale (no stale files from the old version); single files overwritten.
$folders = @('backend\app', 'backend\alembic', 'frontend\dist', 'deploy', 'wheels')
$files = @('backend\alembic.ini', 'backend\requirements.txt', 'VERSION')
foreach ($rel in $folders) {
    $target = Join-Path $InstallDir $rel
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
    $source = Join-Path $package $rel
    if (Test-Path $source) {
        New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
        Copy-Item -Recurse -Force $source $target
    }
}
foreach ($rel in $files) { Copy-Item -Force (Join-Path $package $rel) (Join-Path $InstallDir $rel) }
Write-Ok 'files updated'

$installArgs = @{}
if ($SkipTasks) { $installArgs['SkipTasks'] = $true }
& (Join-Path $InstallDir 'deploy\windows\install.ps1') @installArgs
