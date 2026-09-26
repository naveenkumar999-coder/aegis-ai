$WshShell = New-Object -ComObject WScript.Shell
$targets = @(
    "C:\Users\Boddupalli\Desktop\AEGIS AI.lnk",
    "C:\Users\Boddupalli\OneDrive\Desktop\AEGIS AI.lnk"
)

foreach ($t in $targets) {
    try {
        $parent = Split-Path $t -Parent
        if (Test-Path $parent) {
            $s = $WshShell.CreateShortcut($t)
            $s.TargetPath = "d:\New folder\ultron-by-sagar-builds-main\Start_AEGIS.bat"
            $s.WorkingDirectory = "d:\New folder\ultron-by-sagar-builds-main"
            $s.Description = "Launch A.E.G.I.S. AI Cybernetic Intelligence"
            $s.Save()
            Write-Output "SUCCESS: Created desktop shortcut at $t"
        }
    } catch {
        Write-Output "Error for $t"
    }
}
