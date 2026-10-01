@echo off
chcp 65001 >nul
title Sunian
cd /d "%~dp0sunian"
echo.
echo   Sunian is connecting to QQ ...
echo   Make sure NapCat (Start-Sunian-QQ.bat) is already running.
echo.
"%~dp0sunian\napcat\NapCat-Node\node.exe" src/index.js
echo.
echo (Sunian stopped, press any key to close)
pause >nul