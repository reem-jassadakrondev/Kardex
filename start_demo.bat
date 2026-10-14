@echo off
setlocal

cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
    echo Python not found. Run install_prereqs.bat first.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js not found. Run install_prereqs.bat first.
    pause
    exit /b 1
)

if not exist backend\venv (
    echo Backend virtual environment not found.
    echo Run setup_demo.bat first.
    pause
    exit /b 1
)

if not exist frontend\node_modules (
    echo Frontend dependencies not installed.
    echo Run setup_demo.bat first.
    pause
    exit /b 1
)

start "Kardex Backend" cmd /k "cd /d ""%~dp0backend"" && call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000"

start "Kardex Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm run dev -- --host 0.0.0.0 --port 4173"

start http://localhost:4173

echo.
echo Kardex is starting...
echo Backend: http://localhost:8000
 echo Frontend: http://localhost:4173
 echo Use stop_demo.bat to shut everything down.
pause
