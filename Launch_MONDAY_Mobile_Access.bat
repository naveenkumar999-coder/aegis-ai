@echo off
title MONDAY AI Mobile Access Launcher
cd /d "%~dp0"

echo ======================================================================
echo           MONDAY AI - MOBILE ACCESS & TUNNEL LAUNCHER
echo ======================================================================
echo.

:: 1. Detect active IPv4 address
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0 ^| findstr /v "0.0.0.0.*0.0.0.0"') do (
    set "LOCAL_IP=%%a"
    goto :FOUND_IP
)
:FOUND_IP
if "%LOCAL_IP%"=="" set "LOCAL_IP=10.250.173.50"

echo [1] LOCAL WI-FI ACCESS:
echo     If your mobile and PC are connected to the SAME Wi-Fi router:
echo     Open this URL in Chrome/Safari on your phone:
echo     http://%LOCAL_IP%:3000
echo.
echo ----------------------------------------------------------------------
echo [2] MOBILE HOTSPOT / 5G / CELLULAR ACCESS (BYPASS AP ISOLATION):
echo     If you are using Phone Hotspot (Vivo T3x 5G), Android blocks
echo     direct client IPs. Starting a secure instant mobile tunnel...
echo ----------------------------------------------------------------------
echo.

npx --yes localtunnel --port 3000

pause
