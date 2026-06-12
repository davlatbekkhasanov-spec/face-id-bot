@echo off
cd /d "%~dp0"
title Face ID Poll Bridge
echo Terminaldan Telegramga uzatish...
node scripts/poll-bridge.mjs
pause
