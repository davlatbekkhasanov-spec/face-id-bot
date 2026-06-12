@echo off
cd /d "%~dp0"
title Face ID Bot
if not exist .env (
  echo .env yoq! Avval install-shop.ps1 ni ishga tushiring.
  pause
  exit /b 1
)
echo Face ID bot ishga tushmoqda...
node index.js
pause
