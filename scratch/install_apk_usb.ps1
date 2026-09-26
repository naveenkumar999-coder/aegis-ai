# MONDAY Native Android APK USB Installer for Boss Nani

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     M.O.N.D.A.Y. NATIVE ANDROID APK USB INSTALLER        " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$adbPath = "C:\Users\Boddupalli\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$apkPath = "d:\New folder\ultron-by-sagar-builds-main\monday.apk"

if (-not (Test-Path $apkPath)) {
    Write-Host "[ERROR] Compiled monday.apk not found!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[1/2] Checking USB Connected Android Phone..." -ForegroundColor Green
$devices = & $adbPath devices

Write-Host "     $devices" -ForegroundColor White

if ($devices -match "unauthorized") {
    Write-Host "`n[ACTION REQUIRED]: Check your phone screen right now!" -ForegroundColor Yellow
    Write-Host "   Tap 'ALLOW' on the 'Allow USB Debugging?' popup on your phone screen." -ForegroundColor White
} elseif ($devices -match "device") {
    Write-Host "`n[2/2] Installing MONDAY AI Native Android App onto your phone over USB..." -ForegroundColor Green
    & $adbPath install -r $apkPath
    Write-Host "`nSUCCESS! MONDAY AI Native App installed on your mobile phone screen!" -ForegroundColor Green
    Write-Host "Launching MONDAY on your mobile screen..." -ForegroundColor Yellow
    & $adbPath shell am start -n "com.monday.ai/com.monday.ai.MainActivity"
} else {
    Write-Host "`n[NOTE]: No USB phone detected. Make sure USB cable is plugged in and USB Debugging is ON." -ForegroundColor Yellow
}
Write-Host "==========================================================" -ForegroundColor Cyan
