@echo off
title Stop AEGIS AI Services
cd /d "%~dp0"
echo [*] Terminating AEGIS AI server and background processes...
powershell -Command "$p = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) { Stop-Process -Id $p -Force }"
powershell -Command "Stop-Process -Name 'electron' -Force -ErrorAction SilentlyContinue"
echo [SUCCESS] AEGIS AI processes terminated.
timeout /t 2 >nul
exit
