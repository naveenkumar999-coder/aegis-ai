$WshShell = New-Object -ComObject WScript.Shell

$projectDir = "d:\New folder\ultron-by-sagar-builds-main"
$exePath = Join-Path $projectDir "MONDAY.exe"
$popupBat = Join-Path $projectDir "Launch_MONDAY_Popup.bat"
$icoPath = Join-Path $projectDir "public\favicon.ico"
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
}

$startupDir = [Environment]::GetFolderPath('Startup')
$desktopDir = [Environment]::GetFolderPath('Desktop')

$iconLocation = $icoPath
if (-not (Test-Path $iconLocation)) {
    $iconLocation = "$edgePath, 0"
}

$desktopDirs = @(
    "C:\Users\Boddupalli\Desktop",
    "C:\Users\Boddupalli\OneDrive\Desktop",
    "C:\Users\Boddupalli\OneDrive\Desktop\文件\Desktop"
)

# 1. Create Desktop Shortcuts → Full App (420x620)
foreach ($dir in $desktopDirs) {
    if (Test-Path $dir) {
        foreach ($name in @("MONDAY AI.lnk", "MONDAY AI App.lnk")) {
            $target = Join-Path $dir $name
            $shortcut = $WshShell.CreateShortcut($target)
            $shortcut.TargetPath = $exePath
            $shortcut.WorkingDirectory = $projectDir
            $shortcut.Description = "Launch MONDAY AI Cybernetic Assistant (Full App)"
            $shortcut.IconLocation = $iconLocation
            $shortcut.Save()
            Write-Output "SUCCESS: Created Desktop shortcut (full app) at $target"
        }
    }
}

# 2. Configure Windows Startup shortcut (SINGLE INSTANCE ONLY)
if (Test-Path $startupDir) {
    # Remove any duplicate old shortcuts from Startup
    Remove-Item -Path "$startupDir\MONDAY AI*.lnk" -Force -ErrorAction SilentlyContinue

    # Clean up registry duplicate if present
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "MondayAI" -ErrorAction SilentlyContinue

    $startupTarget = "$startupDir\MONDAY AI.lnk"
    $shortcut = $WshShell.CreateShortcut($startupTarget)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $projectDir
    $shortcut.Description = "Auto-launch MONDAY AI Application on Windows Startup"
    $shortcut.IconLocation = $iconLocation
    $shortcut.Save()
    Write-Output "SUCCESS: Configured Windows Startup application launcher at $startupTarget"
}

