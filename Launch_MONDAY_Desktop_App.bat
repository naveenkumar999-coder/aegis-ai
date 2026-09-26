@echo off
title MONDAY AI Native Desktop Application
cd /d "%~dp0"

:: 1. Check if server is already running on port 3000
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm start' -WindowStyle Hidden -WorkingDirectory '%~dp0'"
    :: Wait for server to initialize
    :WAIT_LOOP
    timeout /t 2 /nobreak >nul
    netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 goto WAIT_LOOP
)

:: 2. Find Windows system browser binary for standalone app window mode (Microsoft Edge native to Windows)
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

:: 3. Single-instance guard: If MONDAY window is already running, activate it and exit!
lib\window_manager.exe restore monday >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [*] MONDAY is already active. Brought existing window to front.
    exit /b 0
)

:: 4. Launch in standalone native popup window (compact popup mode on startup)
start "" "%APP_EXE%" --app=http://localhost:3000?mode=popup --window-size=420,620
exit

