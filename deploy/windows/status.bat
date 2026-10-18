@echo off
rem Show Kardex status.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0status.ps1" %*
pause
