@echo off
cd /d "%~dp0"
title Face ID Bot
if not exist .env (
  echo .env yoq!
  pause
  exit /b 1
)
echo.
echo ========================================
echo   FACE ID BOT - DO'KON KOMPYUTERI
echo   Railway kerak emas!
echo ========================================
echo.
echo Face ID qidiryapman...
node scripts/find-face.mjs
echo.
echo Bot ishga tushmoqda...
node index.js
pause
