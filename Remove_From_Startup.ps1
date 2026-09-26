$startupDir = [Environment]::GetFolderPath('Startup')
$target = Join-Path $startupDir "MONDAY AI App.lnk"
if (Test-Path $target) {
    Remove-Item $target -Force
    Write-Output "SUCCESS: Removed MONDAY AI from Windows Startup."
} else {
    Write-Output "MONDAY AI is not in Windows Startup."
}
