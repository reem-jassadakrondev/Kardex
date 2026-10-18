# Runs the Kardex server (API + built frontend) and restarts it if it ever exits.
# Started at boot by the "Kardex Server" scheduled task (see install.ps1); can also be run by hand.
#
# Logs (in logs\): supervisor.log = starts/exits; server-<start time>.log / .err.log = uvicorn output
# per start (Windows locks a file while uvicorn writes it, so each start gets its own pair).
param([int]$Port = 0, [int]$KeepLogDays = 30)

. "$PSScriptRoot\common.ps1"

if ($Port -eq 0) {
    $Port = 8000
    $configured = (Read-DotEnv)['PORT']
    if ($configured) { $Port = [int]$configured }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$python = Get-VenvPython
$pidFile = Join-Path $LogDir 'server.pid'
$supervisorLog = Join-Path $LogDir 'supervisor.log'

while ($true) {
    $cutoff = (Get-Date).AddDays(-$KeepLogDays)
    Get-ChildItem -Path $LogDir -Filter 'server-*.log' | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item -ErrorAction SilentlyContinue

    $stamp = Get-Stamp 'yyyyMMdd-HHmmss'
    $outLog = Join-Path $LogDir "server-$stamp.log"
    $errLog = Join-Path $LogDir "server-$stamp.err.log"
    Add-Content -Path $supervisorLog -Value "$(Get-Stamp 's') starting uvicorn on port $Port (log server-$stamp)"

    $proc = Start-Process -FilePath $python `
        -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', "$Port", '--no-access-log') `
        -WorkingDirectory $BackendDir -NoNewWindow -PassThru `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    Set-Content -Path $pidFile -Value $proc.Id
    $proc.WaitForExit()

    Add-Content -Path $supervisorLog -Value "$(Get-Stamp 's') uvicorn exited with code $($proc.ExitCode); restarting in 5s"
    Start-Sleep -Seconds 5
}
