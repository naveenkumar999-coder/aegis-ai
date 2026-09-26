@echo off
title MONDAY AI Cybernetic Neural Core
cd /d "%~dp0"

:: Check if server already running
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Starting MONDAY Production Core (Pre-compiled, No compiler needed)...
    start /min "" cmd /c "npm start"
    timeout /t 2 /nobreak >nul
)

:: Launch standalone application window directly (No browser tabs, No address bar)
call Launch_MONDAY_Desktop_App.bat
exit
