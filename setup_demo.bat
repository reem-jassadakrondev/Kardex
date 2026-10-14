@echo off
setlocal

cd /d "%~dp0"

echo =====================================
 echo Setting up Kardex local demo
 echo =====================================

where py >nul 2>nul
if errorlevel 1 (
    echo Python was not found in PATH.
    echo Run install_prereqs.bat first.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found in PATH.
    echo Run install_prereqs.bat first.
    pause
    exit /b 1
)

if not exist backend\venv (
    echo Creating backend virtual environment...
    py -3 -m venv backend\venv
)

call backend\venv\Scripts\activate.bat
cd backend
python -m pip install --upgrade pip
pip install -r requirements.txt
cd /d "%~dp0"

echo Creating backend local env file...
if not exist backend\.env (
    copy backend\.env.demo backend\.env
)

if not exist frontend\.env (
    copy frontend\.env.demo frontend\.env
)

echo Installing frontend dependencies...
cd frontend
call npm install
cd /d "%~dp0"

echo.
echo Setup complete.
echo Next steps:
 echo 1. Run start_demo.bat
 echo 2. Open http://localhost:4173
 echo 3. If needed, run stop_demo.bat later
pause
