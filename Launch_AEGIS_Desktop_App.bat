@echo off
title AEGIS AI Native Desktop Application
cd /d "%~dp0"

:: Single-instance guard: If AEGIS window is already running, activate it and exit!
lib\window_manager.exe restore aegis >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [*] AEGIS is already active. Brought existing window to front.
    exit /b 0
)

:: Check if server is running
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    start /min "" cmd /c "npm start"
    timeout /t 2 /nobreak >nul
)

:: Launch via Edge App Mode
start "" "msedge.exe" --app="http://localhost:3000" --window-size=1400,900 --window-position=60,40
exit
