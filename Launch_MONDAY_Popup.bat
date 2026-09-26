@echo off
title MONDAY AI Popup Startup
cd /d "%~dp0"

:: Start server silently in background if not already running (zero terminal window)
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm start' -WindowStyle Hidden -WorkingDirectory '%~dp0'"
    :: Wait for server to be ready on port 3000
    :WAIT_LOOP
    timeout /t 2 /nobreak >nul
    netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 goto WAIT_LOOP
)

:: Find Edge binary
set "APP_EXE="
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "APP_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "APP_EXE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "APP_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else (
    set "APP_EXE=msedge"
)

:: Check if MONDAY window is already active
lib\window_manager.exe restore monday >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [*] MONDAY is already active. Brought existing window to front.
    exit /b 0
)

:: Open tiny 96x96 popup orb (no browser chrome, no address bar)
start "" "%APP_EXE%" --app=http://localhost:3000?mode=popup --window-size=96,96 --window-position=1820,960 --no-first-run --disable-extensions

exit
