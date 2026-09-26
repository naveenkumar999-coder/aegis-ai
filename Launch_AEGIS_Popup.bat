@echo off
title AEGIS AI Floating OS Overlay
cd /d "%~dp0"

:: Launch detached popup overlay window
start "" "msedge.exe" --app="http://localhost:3000/?mode=popup" --window-size=420,640 --window-position=1460,60
exit
