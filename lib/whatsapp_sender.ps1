param(
    [Parameter(Mandatory=$false)]
    [string]$Phone = "",
    [Parameter(Mandatory=$false)]
    [string]$Message = "",
    [Parameter(Mandatory=$false)]
    [string]$Action = "send",
    [Parameter(Mandatory=$false)]
    [string]$AutoSend = "0"
)

$isAutoSend = ($AutoSend -ne "false" -and $AutoSend -ne "0" -and $AutoSend -ne "$false")

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class WinDeskManager {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    public delegate bool EnumDesktopWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumDesktopWindowsProc lpfn, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint DESKTOP_ALL = 0x01FF;

    public static IntPtr FindWhatsAppWindow(IntPtr hDesktop) {
        IntPtr found = IntPtr.Zero;
        EnumDesktopWindows(hDesktop, (hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                var sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                string title = sb.ToString();
                if (title.IndexOf("WhatsApp", StringComparison.OrdinalIgnoreCase) >= 0) {
                    found = hWnd;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static string RunOnDefaultDesktop(Action<IntPtr> action) {
        string status = "";
        Thread t = new Thread(() => {
            IntPtr hDesk = OpenDesktop("Default", 0, false, 0x10000000 | DESKTOP_ALL);
            if (hDesk == IntPtr.Zero) {
                status = "OpenDesktop failed: " + Marshal.GetLastWin32Error();
                return;
            }
            SetThreadDesktop(hDesk);
            try {
                action(hDesk);
                status = "SUCCESS";
            } finally {
                CloseDesktop(hDesk);
            }
        });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();
        return status;
    }

    public static void ActivateWhatsApp(IntPtr hDesk) {
        IntPtr wa = FindWhatsAppWindow(hDesk);
        if (wa != IntPtr.Zero) {
            ShowWindow(wa, 9); // SW_RESTORE
            BringWindowToTop(wa);
            SetForegroundWindow(wa);
            Thread.Sleep(250);
        }
    }

    public static void PressKey(byte vk) {
        RunOnDefaultDesktop((hDesk) => {
            ActivateWhatsApp(hDesk);
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            Thread.Sleep(80);
            keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        });
    }

    public static void KeyCombination(byte modVk, byte keyVk) {
        RunOnDefaultDesktop((hDesk) => {
            ActivateWhatsApp(hDesk);
            keybd_event(modVk, 0, 0, UIntPtr.Zero);
            Thread.Sleep(60);
            keybd_event(keyVk, 0, 0, UIntPtr.Zero);
            Thread.Sleep(80);
            keybd_event(keyVk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(60);
            keybd_event(modVk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        });
    }
}
"@ -ErrorAction SilentlyContinue

$cleanPhone = ($Phone -replace '[^\d]', '')
if ($cleanPhone.Length -eq 10) { $cleanPhone = "91" + $cleanPhone }

# 1. Action = "open"
if ($Action -eq "open") {
    if ($cleanPhone) {
        Start-Process "whatsapp://send?phone=$cleanPhone" -ErrorAction SilentlyContinue
    } else {
        Start-Process "whatsapp:" -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 800
    [WinDeskManager]::RunOnDefaultDesktop([Action[IntPtr]]{ param($d) [WinDeskManager]::ActivateWhatsApp($d) })
    Write-Output "WHATSAPP_OPENED"
    exit 0
}

# 2. Action = "type"
if ($Action -eq "type") {
    if ($cleanPhone) {
        $deepUrl = "whatsapp://send?phone=$cleanPhone"
        if ($Message) {
            $deepUrl += "&text=" + [System.Uri]::EscapeDataString($Message)
        }
        Start-Process $deepUrl -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 1200
        [WinDeskManager]::RunOnDefaultDesktop([Action[IntPtr]]{ param($d) [WinDeskManager]::ActivateWhatsApp($d) })
        if ($isAutoSend) {
            Start-Sleep -Milliseconds 500
            [WinDeskManager]::PressKey(0x0D) # Enter
            Write-Output "WHATSAPP_MESSAGE_SENT"
        } else {
            Write-Output "WHATSAPP_MESSAGE_TYPED"
        }
        exit 0
    } else {
        Start-Process "whatsapp:" -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 1000
        [WinDeskManager]::RunOnDefaultDesktop([Action[IntPtr]]{ param($d) [WinDeskManager]::ActivateWhatsApp($d) })
        if ($Message) {
            Set-Clipboard -Value $Message
            Start-Sleep -Milliseconds 150
            [WinDeskManager]::KeyCombination(0x11, 0x56) # Ctrl+V
            Start-Sleep -Milliseconds 250
            if ($isAutoSend) {
                [WinDeskManager]::PressKey(0x0D) # Enter
                Write-Output "WHATSAPP_MESSAGE_SENT"
            } else {
                Write-Output "WHATSAPP_MESSAGE_TYPED"
            }
        }
        exit 0
    }
}

# 3. Action = "send" or "clear"
if ($cleanPhone) {
    Start-Process "whatsapp://send?phone=$cleanPhone" -ErrorAction SilentlyContinue
} else {
    Start-Process "whatsapp:" -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 1000

if ($Action -eq "clear") {
    [WinDeskManager]::KeyCombination(0x11, 0x41) # Ctrl+A
    Start-Sleep -Milliseconds 100
    [WinDeskManager]::PressKey(0x08) # Backspace
    Write-Output "WHATSAPP_CLEARED"
} else {
    [WinDeskManager]::PressKey(0x0D) # Enter
    Write-Output "WHATSAPP_SENT"
}
