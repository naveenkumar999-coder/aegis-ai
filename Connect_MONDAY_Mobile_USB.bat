@echo off
title MONDAY AI - Mobile USB Connection Bridge
color 0b

set ADB="C:\Users\Boddupalli\AppData\Local\Android\Sdk\platform-tools\adb.exe"

echo ===================================================
echo           MONDAY AI - Mobile USB Bridge
echo ===================================================
echo Checking for connected phone via USB...

:wait_device
%ADB% get-state >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] Waiting for your phone to be connected via USB with USB Debugging enabled...
    ping 127.0.0.1 -n 3 >nul
    goto wait_device
)

echo [+] Phone detected!
echo [+] Setting up reverse port forwarding (tcp:3000 -> tcp:3000)...
%ADB% reverse tcp:3000 tcp:3000

echo [+] Launching MONDAY AI application on phone...
%ADB% shell am start -n com.monday.ai/.MainActivity >nul 2>&1

echo.
echo ===================================================
echo [SUCCESS] MONDAY AI is connected to your PC over USB!
echo You can now use the app directly on your phone.
echo Keep this window open to maintain automatic reconnection.
echo ===================================================

:loop
ping 127.0.0.1 -n 6 >nul
%ADB% reverse tcp:3000 tcp:3000 >nul 2>&1
goto loop
