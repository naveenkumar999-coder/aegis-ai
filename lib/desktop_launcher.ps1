param(
    [Parameter(Mandatory=$true)]
    [string]$ExePath,
    [Parameter(Mandatory=$false)]
    [string]$Arguments = ""
)

# Strip any surrounding single or double quotes passed from shells
if ($Arguments) {
    $Arguments = $Arguments.Trim().Trim("'").Trim('"').Trim()
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WinDesktopLauncher {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO {
        public Int32 cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public Int32 dwX;
        public Int32 dwY;
        public Int32 dwXSize;
        public Int32 dwYSize;
        public Int32 dwXCountChars;
        public Int32 dwYCountChars;
        public Int32 dwFillAttribute;
        public Int32 dwFlags;
        public Int16 wShowWindow;
        public Int16 cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public Int32 dwProcessId;
        public Int32 dwThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcess(
        string lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation
    );

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public static bool FocusProcess(int pid) {
        bool focused = false;
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                uint p;
                GetWindowThreadProcessId(hWnd, out p);
                if (p == (uint)pid) {
                    ShowWindow(hWnd, 3); // SW_MAXIMIZE
                    SetForegroundWindow(hWnd);
                    SwitchToThisWindow(hWnd, true);
                    focused = true;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        return focused;
    }

    public static int Launch(string exe, string args) {
        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(si);
        si.lpDesktop = @"WinSta0\Default";
        si.dwFlags = 1; // STARTF_USESHOWWINDOW
        si.wShowWindow = 3; // SW_MAXIMIZE

        PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
        string clean = (args ?? "").Trim().Trim('\'', '\"').Trim();
        string cmd;
        if (!string.IsNullOrEmpty(clean)) {
            if (clean.StartsWith("\"") && clean.EndsWith("\"")) {
                cmd = "\"" + exe + "\" " + clean;
            } else {
                cmd = "\"" + exe + "\" \"" + clean + "\"";
            }
        } else {
            cmd = "\"" + exe + "\"";
        }

        bool success = CreateProcess(null, cmd, IntPtr.Zero, IntPtr.Zero, false, 0x00000020, IntPtr.Zero, null, ref si, out pi);
        if (success) {
            int newPid = pi.dwProcessId;
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return newPid;
        }
        return 0;
    }
}
"@ -ErrorAction SilentlyContinue

$resolvedExe = $ExePath
if (-not (Test-Path $resolvedExe)) {
    $norm = $ExePath.ToLower().Trim()
    if ($norm -eq "brave" -or $norm -like "*brave*") {
        $cands = @(
            "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
            "C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe"
        )
        foreach ($c in $cands) { if (Test-Path $c) { $resolvedExe = $c; break } }
    } elseif ($norm -eq "chrome" -or $norm -like "*chrome*") {
        $cands = @(
            "C:\Program Files\Google\Chrome\Application\chrome.exe",
            "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
        )
        foreach ($c in $cands) { if (Test-Path $c) { $resolvedExe = $c; break } }
    } elseif ($norm -eq "msedge" -or $norm -eq "edge" -or $norm -like "*edge*") {
        $cands = @(
            "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        )
        foreach ($c in $cands) { if (Test-Path $c) { $resolvedExe = $c; break } }
    } elseif ($norm -eq "firefox" -or $norm -like "*firefox*") {
        $cands = @(
            "C:\Program Files\Mozilla Firefox\firefox.exe",
            "C:\Program Files (x86)\Mozilla Firefox\firefox.exe"
        )
        foreach ($c in $cands) { if (Test-Path $c) { $resolvedExe = $c; break } }
    }
}

$launchedPid = 0
try {
    $launchedPid = [WinDesktopLauncher]::Launch($resolvedExe, $Arguments)
} catch {}

if ($launchedPid -eq 0) {
    if ($Arguments) {
        $p = Start-Process $resolvedExe -ArgumentList $Arguments -PassThru -ErrorAction SilentlyContinue
        if ($p) { $launchedPid = $p.Id }
    } else {
        $p = Start-Process $resolvedExe -PassThru -ErrorAction SilentlyContinue
        if ($p) { $launchedPid = $p.Id }
    }
}

# Bring target window to foreground
Start-Sleep -Milliseconds 600
$baseProc = [System.IO.Path]::GetFileNameWithoutExtension($resolvedExe)
try {
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.AppActivate($baseProc) | Out-Null
} catch {}

if ($launchedPid -gt 0) {
    try { [WinDesktopLauncher]::FocusProcess($launchedPid) | Out-Null } catch {}
}

# Also ensure any active instance of this browser is brought forward
$allProcs = Get-Process -Name $baseProc -ErrorAction SilentlyContinue
if ($allProcs) {
    foreach ($p in $allProcs) {
        if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
            try {
                [WinDesktopLauncher]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
                [WinDesktopLauncher]::ShowWindow($p.MainWindowHandle, 3) | Out-Null
            } catch {}
            break
        }
    }
}

Write-Output "Launched $resolvedExe on desktop successfully."
