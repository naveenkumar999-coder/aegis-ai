@echo off
title Stop MONDAY AI Server
echo ================================================================
echo    Shutting down MONDAY AI Background Server...
echo ================================================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Terminating PID: %%a on port 3000...
    taskkill /f /pid %%a >nul 2>&1
)
echo.
echo [*] MONDAY AI server terminated cleanly.
timeout /t 3 /nobreak >nul
