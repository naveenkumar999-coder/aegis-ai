@echo off
title AEGIS AI - Install & Update Mobile App
color 0a

set ADB="C:\Users\Boddupalli\AppData\Local\Android\Sdk\platform-tools\adb.exe"
set APK="d:\New folder\ultron-by-sagar-builds-main\aegis.apk"

echo ===================================================
echo     AEGIS AI - Automatic Mobile USB Updater
echo ===================================================
echo Checking for connected phone via USB...
echo Please ensure "USB Debugging" is enabled on your phone.
echo.

:wait_device
%ADB% get-state >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] Waiting for phone connection...
    ping 127.0.0.1 -n 3 >nul
    goto wait_device
)

echo [+] Phone detected!
echo [+] Installing updated AEGIS AI APK to your device...
%ADB% install -r -d -g %APK%
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo [SUCCESS] App updated successfully on your phone!
    echo ===================================================
    echo [+] Setting up local PC bridge port...
    %ADB% reverse tcp:3000 tcp:3000
    echo [+] Launching updated AEGIS app...
    %ADB% shell am start -n com.monday.ai/.MainActivity
) else (
    echo.
    echo [!] Trying standard install...
    %ADB% install -r %APK%
)
pause
