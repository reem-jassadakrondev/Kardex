@echo off
setlocal

echo Stopping Kardex demo processes...

taskkill /F /IM python.exe 2>nul
 taskkill /F /IM node.exe 2>nul
 
 echo All demo processes stopped.
pause
