@echo off
rem Update C:\Kardex from THIS extracted package. Right-click -> Run as administrator.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %*
pause
