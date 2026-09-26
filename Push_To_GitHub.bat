@echo off
title Push AEGIS AI to GitHub
color 0a
cd /d "%~dp0"

echo ===================================================
echo           PUSH AEGIS AI TO GITHUB
echo ===================================================
echo Target: https://github.com/naveenkumar999-coder/aegis-ai.git
echo.
echo Pushing code to GitHub...
echo (If a browser window or credential prompt opens, please click Authorize/Sign-In)
echo.

git push -u origin main

echo.
echo ===================================================
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Your code is successfully uploaded to GitHub!
    echo You can now go to https://vercel.com/new to deploy!
) else (
    echo [!] Push encountered an error or needs authentication.
)
echo ===================================================
pause
