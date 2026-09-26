param(
    [Parameter(Mandatory=$false)]
    [string]$Action = "maximize",

    [Parameter(Mandatory=$false)]
    [string]$Target = "browser"
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;

public class MONDAYWindowManager {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpfn, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    public static string Execute(string action, string target) {
        string act = (action ?? "maximize").ToLower().Trim();
        string tgt = (target ?? "").ToLower().Trim();

        if (tgt == "all" && act == "minimize") {
            try {
                Type shellType = Type.GetTypeFromProgID("Shell.Application");
                dynamic shell = Activator.CreateInstance(shellType);
                shell.MinimizeAll();
                return "SUCCESS: Minimized all desktop windows";
            } catch (Exception ex) {
                return "ERROR: " + ex.Message;
            }
        }

        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x0100);
        if (hDesk == IntPtr.Zero) {
            return "ERROR: Could not open default desktop session";
        }

        IntPtr matchedHwnd = IntPtr.Zero;
        string matchedTitle = "";
        string matchedProcess = "";

        EnumDesktopWindows(hDesk, (hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                StringBuilder sb = new StringBuilder(512);
                GetWindowText(hWnd, sb, 512);
                string title = sb.ToString().Trim();

                if (!string.IsNullOrEmpty(title) &&
                    title != "Program Manager" &&
                    title != "Windows Input Experience" &&
                    title != "Default IME" &&
                    title != "MSCTFIME UI") {

                    uint pid = 0;
                    GetWindowThreadProcessId(hWnd, out pid);
                    string procName = "";
                    try {
                        Process p = Process.GetProcessById((int)pid);
                        procName = p.ProcessName.ToLower();
                    } catch {}

                    string lowerTitle = title.ToLower();
                    bool isTargetMatch = false;

                    bool isSelfUI = lowerTitle.Contains("monday orb") ||
                                    lowerTitle.Contains("ultron") ||
                                    lowerTitle.Contains("localhost:3000") ||
                                    lowerTitle.Contains("127.0.0.1:3000");

                    bool isTargetSelf = tgt == "monday" || tgt == "yourself" || tgt == "ultron" || tgt == "orb" || tgt == "self" || tgt == "you";

                    if (isSelfUI) {
                        if (act == "close") return true;
                        if (!isTargetSelf && (act == "minimize" || act == "minimise")) return true;
                    }

                    if (string.IsNullOrEmpty(tgt) || tgt == "active" || tgt == "current" || tgt == "window" || tgt == "this") {
                        if (!isSelfUI) isTargetMatch = true;
                    } else if (isTargetSelf) {
                        if (isSelfUI) isTargetMatch = true;
                    } else if (tgt == "brave" || tgt == "brave browser") {
                        if (procName == "brave" || (lowerTitle.Contains("brave") && !isSelfUI)) {
                            isTargetMatch = true;
                        }
                    } else if (tgt == "chrome" || tgt == "google chrome") {
                        if (procName == "chrome" || (lowerTitle.Contains("chrome") && !isSelfUI)) {
                            isTargetMatch = true;
                        }
                    } else if (tgt == "edge" || tgt == "msedge" || tgt == "microsoft edge") {
                        if (!isSelfUI && (procName == "msedge" || lowerTitle.Contains("edge"))) {
                            isTargetMatch = true;
                        }
                    } else if (tgt == "firefox") {
                        if (procName == "firefox" || (lowerTitle.Contains("firefox") && !isSelfUI)) {
                            isTargetMatch = true;
                        }
                    } else if (tgt == "browser") {
                        if (!isSelfUI && (procName == "brave" || procName == "chrome" || procName == "firefox" || procName == "opera" || procName == "msedge")) {
                            isTargetMatch = true;
                        }
                    } else if (tgt == "notepad" || tgt == "notpad") {
                        if (procName == "notepad" || lowerTitle.Contains("notepad")) {
                            isTargetMatch = true;
                        }
                    } else if (tgt == "files" || tgt == "explorer" || tgt == "file explorer" || tgt == "folder") {
                        if (procName == "explorer" && (lowerTitle.Contains("explorer") || lowerTitle.Contains("files") || lowerTitle.Contains("downloads") || lowerTitle.Contains("documents"))) {
                            isTargetMatch = true;
                        }
                    } else if (tgt == "whatsapp" || tgt == "watsapp") {
                        if (procName.Contains("whatsapp") || lowerTitle.Contains("whatsapp")) {
                            isTargetMatch = true;
                        }
                    } else if (tgt == "calculator" || tgt == "calc") {
                        if (procName.Contains("calc") || lowerTitle.Contains("calculator")) {
                            isTargetMatch = true;
                        }
                    } else if (tgt == "terminal" || tgt == "cmd" || tgt == "command prompt" || tgt == "powershell") {
                        if (procName == "cmd" || procName == "powershell" || procName == "windowsterminal" || lowerTitle.Contains("terminal")) {
                            isTargetMatch = true;
                        }
                    } else {
                        if (!isSelfUI && (procName.Contains(tgt) || lowerTitle.Contains(tgt))) {
                            isTargetMatch = true;
                        }
                    }

                    if (isTargetMatch && matchedHwnd == IntPtr.Zero) {
                        matchedHwnd = hWnd;
                        matchedTitle = title;
                        matchedProcess = procName;
                    }
                }
            }
            return true;
        }, IntPtr.Zero);

        CloseDesktop(hDesk);

        if (matchedHwnd == IntPtr.Zero) {
            return "NOT_FOUND: No active window found matching target '" + tgt + "'";
        }

        string appLabel = !string.IsNullOrEmpty(matchedTitle) ? matchedTitle : matchedProcess;
        if (isTargetSelf || (matchedTitle != null && (matchedTitle.ToLower().Contains("monday") || matchedTitle.ToLower().Contains("localhost:3000")))) {
            appLabel = "MONDAY interface";
        } else if (appLabel.Length > 40) {
            appLabel = appLabel.Substring(0, 37) + "...";
        }

        if (act == "maximize") {
            SetForegroundWindow(matchedHwnd);
            ShowWindowAsync(matchedHwnd, 3); // SW_MAXIMIZE
            return "SUCCESS: Maximized " + appLabel;
        } else if (act == "minimize") {
            ShowWindowAsync(matchedHwnd, 6); // SW_MINIMIZE
            return "SUCCESS: Minimized " + appLabel;
        } else if (act == "restore") {
            SetForegroundWindow(matchedHwnd);
            ShowWindowAsync(matchedHwnd, 9); // SW_RESTORE
            return "SUCCESS: Restored " + appLabel;
        } else if (act == "fullscreen" || act == "full screen") {
            SetForegroundWindow(matchedHwnd);
            ShowWindowAsync(matchedHwnd, 3); // Maximize
            System.Threading.Thread.Sleep(150);
            keybd_event(0x7A, 0, 0, 0); // VK_F11 down
            System.Threading.Thread.Sleep(50);
            keybd_event(0x7A, 0, 2, 0); // VK_F11 up
            return "SUCCESS: Set " + appLabel + " to Full Screen";
        } else if (act == "close") {
            PostMessage(matchedHwnd, 0x0010, IntPtr.Zero, IntPtr.Zero); // WM_CLOSE
            return "SUCCESS: Closed " + appLabel;
        }

        return "UNKNOWN_ACTION: " + act;
    }
}
"@ -ErrorAction SilentlyContinue

$output = [MONDAYWindowManager]::Execute($Action, $Target)
Write-Output $output
