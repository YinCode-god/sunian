@echo off
chcp 65001 >nul
title Sunian QQ (v4.8.124)
cd /d "%~dp0sunian\napcat\old\NapCat-v4.8.124"

echo.
echo   NapCat v4.8.124   --  supports QQ 9.9.21-38711
echo.
echo   [1] Closing any running QQ ...
echo   [2] A QR code will appear below. Scan it with YOUR ALT QQ ACCOUNT.
echo   [3] Keep this window open after login.
echo.
if exist "KillQQ.bat" call "KillQQ.bat" >nul 2>&1
timeout /t 2 /nobreak >nul
echo.
if exist "launcher-win10-user.bat" (
  call "launcher-win10-user.bat"
) else (
  call "launcher-user.bat"
)
echo.
pause