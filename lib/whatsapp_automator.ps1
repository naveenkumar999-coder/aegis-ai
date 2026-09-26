param(
    [Parameter(Mandatory=$false)]
    [string]$Contact = "you",
    [Parameter(Mandatory=$false)]
    [string]$Message = "",
    [Parameter(Mandatory=$false)]
    [string]$AutoSend = "1"
)

$isAutoSend = ($AutoSend -ne "false" -and $AutoSend -ne "0" -and $AutoSend -ne "$false")

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Diagnostics;

public class WinWhatsAppSearchAutomator {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    public delegate bool EnumDesktopWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumDesktopWindowsProc lpfn, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint DESKTOP_ALL = 0x01FF;

    public static void KeyDown(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); Thread.Sleep(30); }
    public static void KeyUp(byte vk) { keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); Thread.Sleep(30); }
    public static void Tap(byte vk) { KeyDown(vk); KeyUp(vk); }

    public static void Combo2(byte m1, byte vk) {
        KeyDown(m1); KeyDown(vk);
        Thread.Sleep(50);
        KeyUp(vk); KeyUp(m1);
        Thread.Sleep(50);
    }

    public static void Combo3(byte m1, byte m2, byte vk) {
        KeyDown(m1); KeyDown(m2); KeyDown(vk);
        Thread.Sleep(60);
        KeyUp(vk); KeyUp(m2); KeyUp(m1);
        Thread.Sleep(50);
    }

    public static IntPtr FindWhatsApp(IntPtr hDesk) {
        IntPtr found = IntPtr.Zero;
        EnumDesktopWindows(hDesk, (hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                StringBuilder sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                string title = sb.ToString();
                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);
                string pName = "";
                try { pName = Process.GetProcessById((int)pid).ProcessName.ToLower(); } catch {}
                if (title.IndexOf("WhatsApp", StringComparison.OrdinalIgnoreCase) >= 0 &&
                    pName.Contains("whatsapp")) {
                    found = hWnd;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);

        // Fallback: any visible window with WhatsApp title
        if (found == IntPtr.Zero) {
            EnumDesktopWindows(hDesk, (hWnd, lParam) => {
                if (IsWindowVisible(hWnd)) {
                    StringBuilder sb = new StringBuilder(256);
                    GetWindowText(hWnd, sb, 256);
                    string title = sb.ToString();
                    if (title.IndexOf("WhatsApp", StringComparison.OrdinalIgnoreCase) >= 0) {
                        found = hWnd;
                        return false;
                    }
                }
                return true;
            }, IntPtr.Zero);
        }
        return found;
    }

    public static string ExecuteWhatsAppSearch(string query) {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x10000000 | DESKTOP_ALL);
        if (hDesk == IntPtr.Zero) return "FAIL_DESKTOP";
        SetThreadDesktop(hDesk);
        try {
            IntPtr wa = FindWhatsApp(hDesk);
            if (wa == IntPtr.Zero) return "FAIL_NOT_FOUND";

            // 1. Activate & Bring WhatsApp to Foreground
            ShowWindow(wa, 9); // SW_RESTORE
            BringWindowToTop(wa);
            SetForegroundWindow(wa);
            SwitchToThisWindow(wa, true);
            Thread.Sleep(300);

            // 2. Escape out of any active chat/modal
            Tap(0x1B);
            Thread.Sleep(100);
            Tap(0x1B);
            Thread.Sleep(150);

            // 3. Click directly on WhatsApp Search bar (Left column, below header)
            RECT r;
            GetWindowRect(wa, out r);
            int searchX = r.Left + 160;
            int searchY = r.Top + 78;
            SetCursorPos(searchX, searchY);
            Thread.Sleep(50);
            mouse_event(MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, (uint)searchX, (uint)searchY, 0, UIntPtr.Zero);
            Thread.Sleep(150);

            // 4. Send Ctrl + Alt + / (Official WhatsApp Windows global search shortcut)
            Combo3(0x11, 0x12, 0xBF);
            Thread.Sleep(150);

            // 5. Select all and clear
            Combo2(0x11, 0x41); // Ctrl + A
            Thread.Sleep(50);
            Tap(0x08); // Backspace
            Thread.Sleep(100);

            // 6. Paste search query
            Combo2(0x11, 0x56); // Ctrl + V
            Thread.Sleep(900); // Allow WhatsApp real-time search to find 50%-100% matches

            // 7. Navigate down into matching candidate
            Tap(0x28); // Down Arrow
            Thread.Sleep(350);

            // 8. Open conversation
            Tap(0x0D); // Enter
            Thread.Sleep(600);

            return "SUCCESS";
        } finally {
            CloseDesktop(hDesk);
        }
    }

    public static string SendMessageToChat(bool autoSend) {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x10000000 | DESKTOP_ALL);
        if (hDesk == IntPtr.Zero) return "FAIL_DESKTOP";
        SetThreadDesktop(hDesk);
        try {
            Combo2(0x11, 0x56); // Ctrl + V
            Thread.Sleep(250);
            if (autoSend) {
                Tap(0x0D); // Enter
                Thread.Sleep(150);
            }
            return "SUCCESS";
        } finally {
            CloseDesktop(hDesk);
        }
    }
}
"@ -ErrorAction SilentlyContinue

# Ensure WhatsApp is running
$waProc = Get-Process -Name "*whatsapp*" -ErrorAction SilentlyContinue
if (-not $waProc) {
    Start-Process "whatsapp:" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Put contact / search query in clipboard
[System.Windows.Forms.Clipboard]::SetText($Contact)
Start-Sleep -Milliseconds 100

$res = [WinWhatsAppSearchAutomator]::ExecuteWhatsAppSearch($Contact)
if ($res -eq "FAIL_NOT_FOUND") {
    # If window wasn't found, try starting protocol and retry
    Start-Process "whatsapp:" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    [System.Windows.Forms.Clipboard]::SetText($Contact)
    $res = [WinWhatsAppSearchAutomator]::ExecuteWhatsAppSearch($Contact)
}

if ($res -eq "SUCCESS") {
    if ($Message) {
        Start-Sleep -Milliseconds 300
        [System.Windows.Forms.Clipboard]::SetText($Message)
        Start-Sleep -Milliseconds 100
        [WinWhatsAppSearchAutomator]::SendMessageToChat($isAutoSend)
        if ($isAutoSend) {
            Write-Output "WHATSAPP_MESSAGE_SENT"
        } else {
            Write-Output "WHATSAPP_MESSAGE_TYPED"
        }
    }
    Write-Output "WHATSAPP_CONTACT_FOUND"
    Write-Output "WHATSAPP_AUTOMATION_COMPLETED"
    exit 0
} else {
    Write-Output "WHATSAPP_WINDOW_NOT_FOUND"
    exit 1
}
