@echo off
setlocal

echo =====================================
 echo Installing prerequisites for Kardex
 echo =====================================

where winget >nul 2>nul
if errorlevel 1 (
    echo winget not found. Please install App Installer / winget first.
    echo Then rerun this script.
    pause
    exit /b 1
)

echo [1/2] Installing Python 3.12...
winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo Python install failed or was cancelled.
    pause
    exit /b 1
)

echo [2/2] Installing Node.js LTS...
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo Node.js install failed or was cancelled.
    pause
    exit /b 1
)

echo.
echo Prerequisites installed.
echo Please restart the terminal, then run setup_demo.bat
pause
