const { app, BrowserWindow, Tray, Menu, ipcMain, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

let mainWindow = null;
let tray = null;
let nextProcess = null;
let isQuitting = false;

const PORT = 3000;
const SERVER_URL = `http://localhost:${PORT}`;

// Check if Next.js server is already active
function checkServerReady(callback) {
  const req = http.get(SERVER_URL, (res) => {
    if (res.statusCode === 200 || res.statusCode === 304) {
      callback(true);
    } else {
      callback(false);
    }
  });
  req.on("error", () => callback(false));
  req.setTimeout(1000, () => {
    req.destroy();
    callback(false);
  });
}

// Start Next.js server if not already running
function ensureServer(onReady) {
  checkServerReady((ready) => {
    if (ready) {
      console.log("Next.js server is already running.");
      onReady();
    } else {
      console.log("Starting Next.js server internally...");
      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      nextProcess = spawn(npmCmd, ["run", "dev"], {
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, PORT: `${PORT}` },
        stdio: "ignore",
        shell: true,
      });

      const interval = setInterval(() => {
        checkServerReady((isUp) => {
          if (isUp) {
            clearInterval(interval);
            console.log("Next.js server is now ready.");
            onReady();
          }
        });
      }, 1000);
    }
  });
}

function createWindow() {
  const isPopup = !process.argv.includes("--full");
  mainWindow = new BrowserWindow({
    width: isPopup ? 420 : 1400,
    height: isPopup ? 620 : 900,
    minWidth: 360,
    minHeight: 480,
    title: "MONDAY AI - Cybernetic Assistant",
    backgroundColor: "#050508",
    show: false,
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Automatically grant camera and microphone permissions for voice & vision
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ["media", "microphone", "camera", "notifications"];
    if (allowed.includes(permission)) {
      return callback(true);
    }
    callback(false);
  });

  mainWindow.loadURL(isPopup ? `${SERVER_URL}?mode=popup` : SERVER_URL);


  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Minimize to tray instead of quitting when close button is clicked
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  // Open internal popups/overlays as native Electron windows, and external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes("mode=popup")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 420,
          height: 640,
          alwaysOnTop: true,
          autoHideMenuBar: true,
          title: "MONDAY AI - OS Overlay",
          backgroundColor: "#050508",
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
          },
        },
      };
    }
    if (url.includes("localhost:3000")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1400,
          height: 900,
          autoHideMenuBar: true,
        },
      };
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

function createTray() {
  // Use a default tray menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open MONDAY AI",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Exit MONDAY",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  try {
    const iconPath = path.join(__dirname, "..", "public", "favicon.ico");
    tray = new Tray(iconPath);
    tray.setToolTip("MONDAY AI - Cybernetic Intelligence");
    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn("Tray icon creation skipped:", err.message);
  }
}

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Configure Windows Startup auto-launch natively
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false,
        name: "MONDAY AI",
      });
    } catch (e) {
      console.warn("Failed to set login item:", e);
    }

    createTray();

    ensureServer(() => {
      createWindow();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  if (nextProcess) {
    try {
      process.kill(-nextProcess.pid);
    } catch {}
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep alive in tray unless isQuitting
    if (isQuitting) {
      app.quit();
    }
  }
});
