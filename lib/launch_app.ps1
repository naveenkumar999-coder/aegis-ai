param(
    [Parameter(Mandatory=$true)]
    [string]$Command
)

$exe = Join-Path $PSScriptRoot "launch_app.exe"
if (Test-Path $exe) {
    & $exe $Command
} else {
    cmd.exe /c $Command
}

