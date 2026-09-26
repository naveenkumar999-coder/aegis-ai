using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace MondayAI
{
    public class Program
    {
        private static Mutex appMutex = null;
        public static readonly string ProjectDir = @"d:\New folder\ultron-by-sagar-builds-main";
        public static readonly string AppUrl = "http://localhost:3000";
        public static readonly string PopupUrl = "http://localhost:3000?mode=popup";

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [STAThread]
        public static void Main(string[] args)
        {
            bool createdNew;
            appMutex = new Mutex(true, "MONDAY_AI_SingleInstance_Mutex_Core", out createdNew);

            if (!createdNew)
            {
                // AEGIS is already running! Bring existing window to front, DO NOT spawn duplicate window!
                EnsureServerListening(false);
                ActivateExistingWindow();
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MondayContext());
        }

        public static bool IsServerListening()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(AppUrl);
                req.Timeout = 1200;
                using (var res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        public static void EnsureServerListening(bool blockWait)
        {
            if (IsServerListening()) return;

            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c npm start",
                    WorkingDirectory = ProjectDir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(psi);

                if (blockWait)
                {
                    for (int i = 0; i < 25; i++)
                    {
                        Thread.Sleep(600);
                        if (IsServerListening()) break;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("Server start error: " + ex.Message);
            }
        }

        public static bool ActivateExistingWindow()
        {
            try
            {
                string wmPath = Path.Combine(ProjectDir, "lib", "window_manager.exe");
                if (File.Exists(wmPath))
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = wmPath,
                        Arguments = "restore monday",
                        WorkingDirectory = ProjectDir,
                        WindowStyle = ProcessWindowStyle.Hidden,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    var p = Process.Start(psi);
                    p.WaitForExit(2000);
                    return p.ExitCode == 0;
                }
            }
            catch {}
            return false;
        }

        public static void LaunchAppWindow(bool isPopup = true)
        {
            // If AEGIS window already exists on screen, bring it to front instead of creating duplicate!
            if (ActivateExistingWindow())
            {
                return;
            }

            try
            {
                string exe = "";
                string edgePathX86 = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                string edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";

                if (File.Exists(edgePathX86)) exe = edgePathX86;
                else if (File.Exists(edgePath)) exe = edgePath;
                else if (File.Exists(chromePath)) exe = chromePath;
                else exe = "msedge";

                string targetUrl = isPopup ? PopupUrl : AppUrl;
                string args = isPopup
                    ? string.Format("--app=\"{0}\" --window-size=420,620", targetUrl)
                    : string.Format("--app=\"{0}\" --window-size=1400,900", targetUrl);

                var psi = new ProcessStartInfo
                {
                    FileName = exe,
                    Arguments = args,
                    UseShellExecute = true
                };
                Process.Start(psi);
            }
            catch
            {
                Process.Start(isPopup ? PopupUrl : AppUrl);
            }
        }
    }

    public class MondayContext : ApplicationContext
    {
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;

        public MondayContext()
        {
            // 1. Setup Context Menu for Tray Icon
            trayMenu = new ContextMenuStrip();
            var itemOpen = new ToolStripMenuItem("Open AEGIS AI (Popup)", null, (s, e) => Program.LaunchAppWindow(true));
            itemOpen.Font = new Font(itemOpen.Font, FontStyle.Bold);
            trayMenu.Items.Add(itemOpen);
            trayMenu.Items.Add("Open Full Application", null, (s, e) => Program.LaunchAppWindow(false));
            trayMenu.Items.Add(new ToolStripSeparator());
            trayMenu.Items.Add("Restart Server", null, (s, e) => RestartServer());
            trayMenu.Items.Add("Exit AEGIS AI", null, (s, e) => ExitApplication());

            // 2. Setup System Tray Icon
            trayIcon = new NotifyIcon();
            trayIcon.Text = "AEGIS AI - Cybernetic Assistant";
            trayIcon.ContextMenuStrip = trayMenu;
            trayIcon.Visible = true;
            trayIcon.DoubleClick += (s, e) => Program.LaunchAppWindow(true);

            try
            {
                string iconPath = Path.Combine(Program.ProjectDir, "monday.ico");
                if (!File.Exists(iconPath))
                {
                    iconPath = Path.Combine(Program.ProjectDir, "public", "favicon.ico");
                }
                if (File.Exists(iconPath))
                {
                    trayIcon.Icon = new Icon(iconPath);
                }
                else
                {
                    trayIcon.Icon = SystemIcons.Application;
                }
            }
            catch
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            // 3. Keep single-instance managed by Windows Startup folder shortcut, no registry duplicate
            // SetStartup(true);

            // 4. Start Server silently and Open Popup Window ONLY (never full app on startup!)
            new Thread(() =>
            {
                Program.EnsureServerListening(true);
                Program.LaunchAppWindow(true); // Launch as compact popup on power-on!
            }).Start();
        }

        private void RestartServer()
        {
            try
            {
                var killPsi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c Stop_MONDAY.bat",
                    WorkingDirectory = Program.ProjectDir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true
                };
                var p = Process.Start(killPsi);
                p.WaitForExit(3000);
            }
            catch { }

            new Thread(() =>
            {
                Program.EnsureServerListening(true);
                Program.LaunchAppWindow(true);
            }).Start();
        }

        private void SetStartup(bool enable)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true))
                {
                    if (key != null)
                    {
                        if (enable)
                        {
                            string exePath = Application.ExecutablePath;
                            key.SetValue("MondayAI", "\"" + exePath + "\"");
                        }
                        else
                        {
                            key.DeleteValue("MondayAI", false);
                        }
                    }
                }
            }
            catch { }
        }

        private void ExitApplication()
        {
            trayIcon.Visible = false;
            try
            {
                var killPsi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c Stop_MONDAY.bat",
                    WorkingDirectory = Program.ProjectDir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true
                };
                var p = Process.Start(killPsi);
                p.WaitForExit(3000);
            }
            catch { }
            Application.Exit();
        }
    }
}
