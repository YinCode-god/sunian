@echo off
chcp 65001 >nul
title Sunian - Chat
cd /d "%~dp0sunian"
"%~dp0sunian\napcat\NapCat-Node\node.exe" src/index.js --cli
echo.
echo (session ended, press any key to close)
pause >nul