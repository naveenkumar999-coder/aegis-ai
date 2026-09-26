using System;
using System.Runtime.InteropServices;

namespace MondayLauncher {
    public class Program {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct STARTUPINFO {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct PROCESS_INFORMATION {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
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

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr hObject);

        [STAThread]
        public static int Main(string[] args) {
            if (args.Length == 0) return 1;

            string command = string.Join(" ", args).Trim();
            if (string.IsNullOrEmpty(command)) return 1;

            STARTUPINFO si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(si);
            si.lpDesktop = @"WinSta0\Default";
            si.dwFlags = 1;
            si.wShowWindow = 0; // SW_HIDE for intermediate cmd wrapper

            PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
            string fullCmd = "cmd.exe /c " + command;
            bool ok = CreateProcess(null, fullCmd, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, null, ref si, out pi);
            if (ok) {
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
                return 0;
            }
            return Marshal.GetLastWin32Error();
        }
    }
}
