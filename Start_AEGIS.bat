@echo off
title AEGIS AI Cybernetic Neural Core
cd /d "%~dp0"

:: Check if server already running
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Starting AEGIS Production Core...
    start /min "" cmd /c "npm start"
    timeout /t 2 /nobreak >nul
)

:: Launch standalone application window directly
call Launch_AEGIS_Desktop_App.bat
exit
