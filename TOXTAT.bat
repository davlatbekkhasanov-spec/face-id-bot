@echo off
echo Local face-id-bot jarayonlarini to'xtatish...
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo list ^| find "PID:"') do (
  wmic process where "ProcessId=%%a" get CommandLine 2>nul | find /i "face-id-bot" >nul && (
    echo To'xtatildi PID %%a
    taskkill /PID %%a /F >nul 2>&1
  )
)
echo Tayyor. Faqat Railway ishlashi kerak.
pause
