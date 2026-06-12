# Face ID bot — do'kon kompyuterida bir marta ishga tushiring
# O'ng tugma -> "Run with PowerShell"

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "=== Face ID bot o'rnatish ===" -ForegroundColor Cyan

# Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js yo'q. Winget orqali o'rnatilmoqda..." -ForegroundColor Yellow
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
    [System.Environment]::GetEnvironmentVariable("Path", "User")
}

Write-Host "Node: $(node --version)"
npm install

# .env
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host ""
  Write-Host ".env yaratildi. FACE_DEVICE_PASSWORD ni kiriting!" -ForegroundColor Yellow
  notepad .env
}

# SADP
$sadpPage = "https://www.hikvision.com/us-en/support/tools/hitools/clc14d7e1a69a237dd/"
Write-Host ""
Write-Host "SADP yuklab olish (Hikvision hisob kerak bo'lishi mumkin):" -ForegroundColor Cyan
Start-Process $sadpPage

# Desktop shortcut
$bat = Join-Path $Root "ISHGA-TUSHIR.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $desktop "Face ID Bot.lnk"
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($lnk)
$sc.TargetPath = $bat
$sc.WorkingDirectory = $Root
$sc.Description = "Hikvision Face ID -> Telegram"
$sc.Save()

Write-Host ""
Write-Host "Tayyor! Keyingi qadamlar:" -ForegroundColor Green
Write-Host "1. Terminal LAN kabelini router/switch ga ulang"
Write-Host "2. SADP da qurilmani toping, IP va parol o'rnating"
Write-Host "3. .env da FACE_DEVICE_IP va FACE_DEVICE_PASSWORD ni yozing"
Write-Host "4. ISHGA-TUSHIR.bat ni bosing"
Write-Host ""
Write-Host "IP qidirish: node scripts/find-face.mjs"
Write-Host "Ulanish test:  node scripts/test-device.mjs"
