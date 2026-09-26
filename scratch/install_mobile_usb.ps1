# MONDAY Mobile USB Auto-Installer Script for Boss Nani

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   M.O.N.D.A.Y. MOBILE USB INSTALLER & PORT FORWARDER     " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# Step 1: Detect Local IP Address
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" }).IPAddress | Select-Object -First 1

Write-Host "`n[1/3] PC Local Network Server Address:" -ForegroundColor Green
Write-Host "     http://$($localIP):3000" -ForegroundColor White

Write-Host "`n[2/3] Checking connected Android USB Devices..." -ForegroundColor Green

# Check if ADB is available in common paths
$adbPath = Get-Command adb -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $adbPath) {
    $commonAdb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    if (Test-Path $commonAdb) {
        $adbPath = $commonAdb
    }
}

if ($adbPath) {
    Write-Host "     Found ADB at: $adbPath" -ForegroundColor Gray
    $devices = & $adbPath devices
    Write-Host "     $devices" -ForegroundColor White
    
    Write-Host "`n     Setting up USB Port Forwarding (port 3000)..." -ForegroundColor Yellow
    & $adbPath reverse tcp:3000 tcp:3000
    Write-Host "     SUCCESS: Mobile USB Port 3000 mapped to PC localhost:3000!" -ForegroundColor Green
} else {
    Write-Host "     Note: ADB command line tool not in PATH." -ForegroundColor Yellow
    Write-Host "     You can connect phone via USB & open Chrome inspect: chrome://inspect/#devices" -ForegroundColor White
}

Write-Host "`n[3/3] MOBILE INSTALLATION STEPS FOR BOSS NANI:" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "1. Enable 'USB Debugging' on your phone:" -ForegroundColor White
Write-Host "   Settings -> About Phone -> Tap 'Build Number' 7 times -> Developer Options -> USB Debugging [ON]" -ForegroundColor Gray
Write-Host "2. Connect phone to PC via USB cable and allow 'USB Debugging Permission' on phone." -ForegroundColor White
Write-Host "3. On PC Chrome, open: chrome://inspect/#devices" -ForegroundColor White
Write-Host "4. Open http://$($localIP):3000 on your phone and tap 'Add to Home Screen'!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
