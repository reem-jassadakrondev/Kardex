@echo off
rem Import a spreadsheet into a table (replaces that table's data). Drag the .xlsx/.csv file onto this file.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0import-rounds.ps1" -File "%~1"
pause
