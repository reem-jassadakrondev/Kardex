@echo off
rem Restore a backup: restore.bat C:\Kardex\backups\kardex-YYYYMMDD-HHMMSS.dump
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore.ps1" -File %*
pause
