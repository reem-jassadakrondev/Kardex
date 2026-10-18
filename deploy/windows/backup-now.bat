@echo off
rem Back up the Kardex database now.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1" %*
pause
