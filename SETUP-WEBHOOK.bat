@echo off
cd /d "%~dp0"
echo Hikvision webhook o'rnatish...
node scripts/setup-webhook.mjs
pause
