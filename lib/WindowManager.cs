using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;

namespace MondayWindowManager {
    public class Program {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
        [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
        [DllImport("user32.dll", SetLastError = true)] public static extern bool CloseDesktop(IntPtr hDesktop);
        [DllImport("user32.dll", SetLastError = true)] public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpfn, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
        [DllImport("user32.dll", SetLastError = true)] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll", SetLastError = true)] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll", SetLastError = true)] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fUnknown);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
        [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
        [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT {
            public int Left, Top, Right, Bottom;
        }

        public const int SW_SHOWNORMAL = 1;
        public const int SW_SHOWMINIMIZED = 2;
        public const int SW_MAXIMIZE = 3;
        public const int SW_SHOW = 5;
        public const int SW_MINIMIZE = 6;
        public const int SW_RESTORE = 9;
        public const int SW_FORCEMINIMIZE = 11;
        public const uint WM_CLOSE = 0x0010;
        public const byte VK_F11 = 0x7A;

        public class WindowInfo {
            public IntPtr Hwnd;
            public string Title;
            public string ProcessName;
            public int Width;
            public int Height;
            public bool IsVisible;
            public bool IsIconic;
            public bool IsZoomed;
        }

        public static int Main(string[] args) {
            if (args.Length == 0) {
                Console.WriteLine("Usage: window_manager.exe <action> [target]");
                return 1;
            }

            string action = args[0].ToLower().Trim();
            string target = args.Length > 1 ? args[1].ToLower().Trim() : "";

            if (target == "all" && (action == "minimize" || action == "minimise")) {
                try {
                    Type shellType = Type.GetTypeFromProgID("Shell.Application");
                    object shell = Activator.CreateInstance(shellType);
                    shellType.InvokeMember("MinimizeAll", System.Reflection.BindingFlags.InvokeMethod, null, shell, null);
                    Console.WriteLine("SUCCESS: Minimized all desktop windows, Boss!");
                    return 0;
                } catch (Exception ex) {
                    Console.WriteLine("ERROR: " + ex.Message);
                    return 1;
                }
            }

            int exitCode = 0;
            string resultMessage = "";

            Thread workerThread = new Thread(() => {
                IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
                if (hDesk == IntPtr.Zero) {
                    hDesk = OpenDesktop("default", 0, false, 0x01FF);
                }

                if (hDesk == IntPtr.Zero) {
                    resultMessage = "ERROR: Could not attach to interactive desktop session";
                    exitCode = 2;
                    return;
                }

                bool attached = SetThreadDesktop(hDesk);
                if (!attached) {
                    resultMessage = "ERROR: SetThreadDesktop failed with code " + Marshal.GetLastWin32Error();
                    CloseDesktop(hDesk);
                    exitCode = 3;
                    return;
                }

                List<WindowInfo> windows = new List<WindowInfo>();

                EnumDesktopWindows(hDesk, (hWnd, lParam) => {
                    RECT r;
                    GetWindowRect(hWnd, out r);
                    int w = r.Right - r.Left;
                    int h = r.Bottom - r.Top;
                    bool visible = IsWindowVisible(hWnd);
                    bool iconic = IsIconic(hWnd);
                    bool zoomed = IsZoomed(hWnd);

                    StringBuilder sb = new StringBuilder(512);
                    GetWindowText(hWnd, sb, 512);
                    string title = sb.ToString().Trim();

                    uint pid = 0;
                    GetWindowThreadProcessId(hWnd, out pid);
                    string procName = "";
                    try {
                        Process p = Process.GetProcessById((int)pid);
                        procName = p.ProcessName.ToLower();
                    } catch {}

                    if (!string.IsNullOrEmpty(title) &&
                        title != "Program Manager" &&
                        title != "Windows Input Experience" &&
                        title != "TextInputHost" &&
                        title != "Default IME" &&
                        title != "MSCTFIME UI" &&
                        title != "PopupHost") {

                        if ((w > 80 && h > 80) || iconic || zoomed || visible) {
                            windows.Add(new WindowInfo {
                                Hwnd = hWnd,
                                Title = title,
                                ProcessName = procName,
                                Width = w,
                                Height = h,
                                IsVisible = visible,
                                IsIconic = iconic,
                                IsZoomed = zoomed
                            });
                        }
                    }
                    return true;
                }, IntPtr.Zero);

                List<WindowInfo> matchedList = new List<WindowInfo>();
                bool isTargetSelf = target == "monday" || target == "yourself" || target == "ultron" || target == "orb" || target == "self" || target == "you";

                foreach (var win in windows) {
                    string lowerTitle = win.Title.ToLower();
                    string p = win.ProcessName;
                    bool isMatch = false;

                    // Always protect the MONDAY Orb AI interface from accidental close or minimize
                    bool isSelfUI = lowerTitle.Contains("monday orb") ||
                                    lowerTitle.Contains("monday ai") ||
                                    lowerTitle.Contains("monday voice") ||
                                    lowerTitle.Contains("ultron") ||
                                    lowerTitle.Contains("localhost:3000") ||
                                    lowerTitle.Contains("127.0.0.1:3000");

                    if (isSelfUI) {
                        // MONDAY windows are ALWAYS immune to close (from any source)
                        if (action == "close") {
                            continue;
                        }
                        // MONDAY windows are ALWAYS immune to minimize (popup must stay visible)
                        // Only fullscreen/maximize/restore are allowed when isTargetSelf
                        if (action == "minimize" || action == "minimise") {
                            continue;
                        }
                    }

                    if (string.IsNullOrEmpty(target) || target == "active" || target == "current" || target == "window" || target == "this") {
                        if (win.IsVisible && !win.IsIconic && win.Width > 150 && !isSelfUI) {
                            isMatch = true;
                        }
                    } else if (isTargetSelf) {
                        if (isSelfUI) {
                            isMatch = true;
                        }
                    } else if (target == "whatsapp" || target == "watsapp") {
                        if (p.Contains("whatsapp") || lowerTitle.Contains("whatsapp")) {
                            isMatch = true;
                        }
                    } else if (target == "notepad" || target == "notpad") {
                        if (p == "notepad" || lowerTitle.Contains("notepad")) {
                            isMatch = true;
                        }
                    } else if (target == "brave" || target == "brave browser") {
                        if (p == "brave" || (lowerTitle.Contains("brave") && !isSelfUI)) {
                            isMatch = true;
                        }
                    } else if (target == "chrome" || target == "google chrome") {
                        if (p == "chrome" || (lowerTitle.Contains("chrome") && !isSelfUI)) {
                            isMatch = true;
                        }
                    } else if (target == "edge" || target == "msedge" || target == "microsoft edge") {
                        if (!isSelfUI && (p == "msedge" || lowerTitle.Contains("edge"))) {
                            isMatch = true;
                        }
                    } else if (target == "firefox") {
                        if (p == "firefox" || (lowerTitle.Contains("firefox") && !isSelfUI)) {
                            isMatch = true;
                        }
                    } else if (target == "browser") {
                        // Generic browser target: match external web browsers, never self UI
                        if (!isSelfUI && (p == "brave" || p == "chrome" || p == "firefox" || p == "opera" || p == "msedge")) {
                            isMatch = true;
                        }
                    } else if (target == "files" || target == "explorer" || target == "file explorer" || target == "folder") {
                        if (p == "explorer" && (lowerTitle.Contains("explorer") || lowerTitle.Contains("files") || lowerTitle.Contains("downloads") || lowerTitle.Contains("documents") || lowerTitle.Contains("pc") || lowerTitle.Contains("drive"))) {
                            if (lowerTitle != "program manager" && lowerTitle != "taskbar") {
                                isMatch = true;
                            }
                        }
                    } else if (target == "calculator" || target == "calc") {
                        if (p.Contains("calc") || lowerTitle.Contains("calculator")) {
                            isMatch = true;
                        }
                    } else {
                        if (!isSelfUI && (p == target || lowerTitle.Contains(target))) {
                            isMatch = true;
                        }
                    }

                    if (isMatch) {
                        matchedList.Add(win);
                    }
                }

                if (matchedList.Count == 0) {
                    resultMessage = "NOT_FOUND: No active window found matching target '" + target + "'";
                    exitCode = 4;
                    CloseDesktop(hDesk);
                    return;
                }

                string appDisplay = !string.IsNullOrEmpty(matchedList[0].Title) ? matchedList[0].Title : matchedList[0].ProcessName;
                if (isTargetSelf || matchedList.Exists(w => w.Title.ToLower().Contains("monday orb") || w.Title.ToLower().Contains("localhost:3000") || w.Title.ToLower().Contains("ultron"))) {
                    appDisplay = "MONDAY interface";
                } else if (appDisplay.Length > 45) {
                    appDisplay = appDisplay.Substring(0, 42) + "...";
                }

                foreach (var win in matchedList) {
                    IntPtr targetHwnd = win.Hwnd;

                    if (action == "minimize" || action == "minimise") {
                        ShowWindow(targetHwnd, SW_MINIMIZE);
                        ShowWindowAsync(targetHwnd, SW_MINIMIZE);
                        ShowWindowAsync(targetHwnd, SW_FORCEMINIMIZE);
                    } else if (action == "maximize" || action == "maximise" || action == "fullscreen" || action == "full screen" || action == "full_screen") {
                        SetForegroundWindow(targetHwnd);
                        SwitchToThisWindow(targetHwnd, true);

                        // If window was accidentally placed in borderless kiosk mode (covering taskbar and title bar), exit it
                        RECT r;
                        GetWindowRect(targetHwnd, out r);
                        if (r.Left == 0 && r.Top == 0 && r.Right >= 1920 && r.Bottom >= 1080) {
                            keybd_event(VK_F11, 0, 0, 0);
                            Thread.Sleep(50);
                            keybd_event(VK_F11, 0, 2, 0);
                            Thread.Sleep(100);
                        }

                        // Use native SW_MAXIMIZE to preserve title bar, -, +, X buttons, taskbar, mouse sliders & 3-finger gestures
                        ShowWindow(targetHwnd, SW_MAXIMIZE);
                        ShowWindowAsync(targetHwnd, SW_MAXIMIZE);
                    } else if (action == "restore" || action == "unmaximize") {
                        SetForegroundWindow(targetHwnd);
                        SwitchToThisWindow(targetHwnd, true);

                        // If window was in borderless mode, toggle back to standard windowed
                        RECT r;
                        GetWindowRect(targetHwnd, out r);
                        if (r.Left == 0 && r.Top == 0 && r.Right >= 1920 && r.Bottom >= 1080) {
                            keybd_event(VK_F11, 0, 0, 0);
                            Thread.Sleep(50);
                            keybd_event(VK_F11, 0, 2, 0);
                            Thread.Sleep(100);
                        }

                        ShowWindow(targetHwnd, SW_RESTORE);
                        ShowWindowAsync(targetHwnd, SW_RESTORE);
                    } else if (action == "close") {
                        PostMessage(targetHwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                    }
                }

                if (action == "minimize" || action == "minimise") {
                    resultMessage = "SUCCESS: Minimized " + appDisplay + " to taskbar, Boss!";
                    exitCode = 0;
                } else if (action == "fullscreen" || action == "full screen" || action == "full_screen") {
                    resultMessage = "SUCCESS: Set " + appDisplay + " to Full Screen, Boss!";
                    exitCode = 0;
                } else if (action == "maximize" || action == "maximise") {
                    resultMessage = "SUCCESS: Maximized " + appDisplay + " on your desktop, Boss!";
                    exitCode = 0;
                } else if (action == "restore" || action == "unmaximize") {
                    resultMessage = "SUCCESS: Restored " + appDisplay + " window, Boss!";
                    exitCode = 0;
                } else if (action == "close") {
                    resultMessage = "SUCCESS: Closed " + appDisplay + ", Boss!";
                    exitCode = 0;
                } else {
                    resultMessage = "UNKNOWN_ACTION: " + action;
                    exitCode = 5;
                }

                CloseDesktop(hDesk);
            });

            workerThread.Start();
            workerThread.Join();

            Console.WriteLine(resultMessage);
            return exitCode;
        }
    }
}
