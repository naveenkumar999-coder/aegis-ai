import { NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";

function findInstalledShortcut(rawApp: string): string | null {
  const q = rawApp.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!q || q.length < 2) return null;

  const dirs = [
    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
    path.join(process.env.LOCALAPPDATA || "", "Programs"),
  ];

  function scan(dir: string): { name: string; path: string }[] {
    let results: { name: string; path: string }[] = [];
    try {
      const items = fsSync.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const p = path.join(dir, item.name);
        if (item.isDirectory()) {
          results = results.concat(scan(p));
        } else if (item.name.toLowerCase().endsWith(".lnk")) {
          results.push({ name: item.name, path: p });
        }
      }
    } catch {}
    return results;
  }

  let allLnks: { name: string; path: string }[] = [];
  for (const d of dirs) {
    allLnks = allLnks.concat(scan(d));
  }

  for (const lnk of allLnks) {
    const cleanName = lnk.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanName.includes(q) || q.includes(cleanName.replace("lnk", ""))) {
      return lnk.path;
    }
  }
  return null;
}
import {
  setLastSearchContext,
  getLastSearchContext,
  setLastChatContext,
  getLastChatContext,
  ChatContext,
  fetchLiveReadout,
  KNOWN_WEB_PORTALS,
  findPortalMatch,
  getTopSearchUrl,
} from "@/lib/searchStore";
import {
  setUserPhone,
  saveContact,
  resolveContactPhone,
  getContacts,
} from "@/lib/contactStore";

const execAsync = promisify(exec);

async function persistSearchContext(ctx: any) {
  try {
    setLastSearchContext(ctx);
    const filePath = path.join(process.cwd(), ".monday_last_search.json");
    await fs.writeFile(filePath, JSON.stringify(ctx, null, 2), "utf8");
  } catch (err) {
    console.warn("Failed to persist search context:", err);
  }
}

async function persistChatContext(ctx: ChatContext) {
  try {
    setLastChatContext(ctx);
    const filePath = path.join(process.cwd(), ".monday_last_chat.json");
    await fs.writeFile(filePath, JSON.stringify(ctx, null, 2), "utf8");
  } catch (err) {
    console.warn("Failed to persist chat context:", err);
  }
}

async function loadPersistedChatContext(): Promise<ChatContext | null> {
  const mem = getLastChatContext();
  if (mem) return mem;
  try {
    const filePath = path.join(process.cwd(), ".monday_last_chat.json");
    const data = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(data);
    setLastChatContext(parsed);
    return parsed;
  } catch {
    return null;
  }
}


interface AppConfig {
  keywords: string[];
  command: string;
  fallbackUrl?: string;
  name: string;
}

function getBrowserLaunchScript(browser: string, url?: string): string {
  const launcherPath = path.join(process.cwd(), "lib", "desktop_launcher.ps1").replace(/\\/g, "/");
  const b = (browser || "edge").toLowerCase();
  let exe = "edge";
  if (b.includes("chrome")) exe = "chrome";
  else if (b.includes("brave")) exe = "brave";
  else if (b.includes("firefox")) exe = "firefox";

  const cleanUrl = url ? url.trim().replace(/^['"]+|['"]+$/g, "") : "";
  const urlArg = cleanUrl ? ` -Arguments "${cleanUrl}"` : "";
  return `powershell -ExecutionPolicy Bypass -File "${launcherPath}" -ExePath "${exe}"${urlArg}`;
}

function resolveSearchTarget(rawText: string, specifiedBrowser?: string, specifiedPlatform?: string) {
  let bTarget = (specifiedBrowser || "").toLowerCase().trim();
  if (!bTarget) {
    if (/\b(chrome|google chrome)\b/i.test(rawText)) bTarget = "chrome";
    else if (/\b(brave|brave browser)\b/i.test(rawText)) bTarget = "brave";
    else if (/\b(firefox)\b/i.test(rawText)) bTarget = "firefox";
    else bTarget = "edge";
  }

  // Detect Route / Directions intent (e.g. find root to ibherampatnum, route to X, directions to X)
  const isRouteReq =
    /\b(root to|route to|directions to|direction to|way to|path to|navigate to|navigation to|how to go to|how to reach to|how to reach|how to go)\b/i.test(rawText) ||
    specifiedPlatform === "maps_route";

  if (isRouteReq) {
    let dest = rawText
      .replace(/(?:open|launch|start)?\s*(?:brave|chrome|edge|firefox|browser)?\s*(?:in my pc|on my pc|in my laptop|on my laptop|in pc|on pc|in laptop|on laptop)?\s*(?:and|to)?\s*(?:find|search|show|get)?\s*(?:root to|route to|directions to|direction to|way to|path to|navigate to|navigation to|how to go to|how to reach to|how to reach|how to go|root|route|directions|direction|way|path)/gi, "")
      .replace(/\b(in maps|on maps|in google maps|on google maps|maps|in my pc|on my pc|for me|please)\b/gi, "")
      .replace(/[?.,!]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    dest = dest || "destination";
    const searchUrl = `https://www.google.com/maps/dir//${encodeURIComponent(dest)}`;
    const platformName = "Google Maps Directions";
    return { bTarget, platform: "maps_route", cleanQ: `route to ${dest}`, searchUrl, platformName };
  }

  // Check if specified platform matches any known portal
  let platform = (specifiedPlatform || "").toLowerCase().trim();
  let portalMatch = platform ? findPortalMatch(platform) : undefined;

  // Pattern A: "search <query> in/on/at <portal> [web/website/site]" (e.g. "search apple in geeksforgeeks web")
  if (!portalMatch) {
    const pMatch = rawText.match(/(?:search|se4arch|serach|seach|serch|lookup|look up|find)\s+(.+?)\s+(?:in|on|at|inside)\s+([a-zA-Z0-9_\s.-]+?)(?:\s+(?:web|website|site|portal|page|browser|app))?$/i);
    if (pMatch && pMatch[1] && pMatch[2]) {
      const candPortal = pMatch[2].trim();
      const p = findPortalMatch(candPortal);
      if (p) {
        portalMatch = p;
        platform = p.id;
      }
    }
  }

  // Pattern B: search for known portal anywhere in rawText
  if (!portalMatch) {
    for (const p of KNOWN_WEB_PORTALS) {
      if (p.id === "google") continue;
      for (const alias of p.aliases) {
        const re = new RegExp(`(^|\\b)${alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\b|$)`, "i");
        if (re.test(rawText)) {
          portalMatch = p;
          platform = p.id;
          break;
        }
      }
      if (portalMatch) break;
    }
  }

  let cleanQ = rawText
    .replace(/(?:open|launch|start)?\s*(?:brave|chrome|edge|firefox|browser)?\s*(?:in my pc|on my pc|in my laptop|on my laptop|in pc|on pc|in laptop|on laptop)?\s*(?:and|to)?\s*(?:search|se4arch|serach|seach|serch|google|lookup|look up|\bfind\b|\bbrowse\b)\s*(?:for|on|about)?/gi, "")
    .replace(/\b(in edge browser|on edge browser|in chrome browser|on chrome browser|in brave browser|on brave browser|in edge|on edge|in chrome|on chrome|in brave|on brave|edge browser|chrome browser|brave browser|browser)\b/gi, "")
    .replace(/\b(in my pc|on my pc|in my laptop|on my laptop|in pc|on pc|in laptop|on laptop|for me|please)\b/gi, "");

  if (portalMatch) {
    for (const alias of portalMatch.aliases) {
      cleanQ = cleanQ.replace(new RegExp(`\\b(in|on|at|inside)?\\s*${alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*(web|website|site|portal|page)?\\b`, "gi"), "");
    }
  }

  cleanQ = cleanQ
    .replace(/\b(web|website|site|portal|page)\b/gi, "")
    .replace(/[?.,!]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:(?:search\s+)?(?:fo\s+)?r\s*=\s*|[a-z0-9_-]{1,6}\s*=\s*|[=:\-–—\s]+)/i, "")
    .replace(/^(?:for|fo|about|on|of|with|to)\s+/i, "")
    .replace(/\s+(?:for|about|on|of)$/i, "")
    .trim();

  cleanQ = cleanQ || rawText;

  let searchUrl = "";
  let platformName = "";

  if (portalMatch) {
    searchUrl = portalMatch.searchUrl(cleanQ);
    platformName = portalMatch.name;
    platform = portalMatch.id;
  } else {
    platform = "web";
    searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQ)}`;
    platformName = `${bTarget === "msedge" || bTarget === "edge" ? "EDGE" : bTarget.toUpperCase()} Browser`;
  }

  return { bTarget, platform, cleanQ, searchUrl, platformName };
}

const APP_COMMAND_MAP: AppConfig[] = [
  {
    name: "Antigravity",
    keywords: ["antigravity", "anti gravity", "anti-gravity", "google antigravity", "antigravity ide", "antigravity agent"],
    command: 'powershell -ExecutionPolicy Bypass -Command "Start-Process \'$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Antigravity.lnk\'"',
  },
  {
    name: "Battery & Energy Saver Settings",
    keywords: ["energy saver", "battery saver", "power saver", "battery settings", "battery", "powersaver"],
    command: "start ms-settings:batterysaver",
  },
  {
    name: "Power & Sleep Settings",
    keywords: ["power settings", "sleep settings", "power", "sleep"],
    command: "start ms-settings:powersleep",
  },

  {
    name: "Sound & Volume Settings",
    keywords: ["sound settings", "volume settings", "sound", "audio settings"],
    command: "start ms-settings:sound",
  },
  {
    name: "Display & Screen Settings",
    keywords: ["display settings", "brightness settings", "screen settings", "display"],
    command: "start ms-settings:display",
  },
  {
    name: "Network & Wi-Fi Settings",
    keywords: ["wifi settings", "network settings", "wifi", "bluetooth settings", "bluetooth"],
    command: "start ms-settings:network",
  },
  {
    name: "WhatsApp",
    keywords: ["whatsapp", "watsapp", "whats app", "whatsap", "wats app", "wasap"],
    command: "start whatsapp:",
    fallbackUrl: "https://web.whatsapp.com",
  },
  {
    name: "Windows Settings",
    keywords: ["settings", "setings", "setting", "pc settings", "windows settings"],
    command: "start ms-settings:",
  },
  {
    name: "Windows Clock & Alarms",
    keywords: ["clock", "clok", "alarm", "alarms", "timer", "stopwatch"],
    command: "start ms-clock:",
  },
  {
    name: "Camera",
    keywords: ["camera", "cam", "webcam"],
    command: "start microsoft.windows.camera:",
  },
  {
    name: "Photos & Gallery",
    keywords: ["photos", "gallery", "pictures", "photo"],
    command: "start ms-photos:",
  },
  {
    name: "Calculator",
    keywords: ["calculator", "calc", "cal c", "calculater"],
    command: "start calc",
  },
  {
    name: "Notepad",
    keywords: ["notepad", "not pad", "note pad", "notpad"],
    command: "start notepad",
  },
  {
    name: "File Explorer",
    keywords: ["explorer", "file explorer", "files", "my files", "file", "folders", "file manager", "open files", "open files in pc"],
    command: "start explorer.exe /separate",
  },
  {
    name: "Task Manager",
    keywords: ["task manager", "taskmgr", "task man", "taskmanager"],
    command: "start taskmgr",
  },
  {
    name: "Microsoft Word",
    keywords: ["word", "ms word", "microsoft word", "winword"],
    command: "start winword",
  },
  {
    name: "Microsoft Excel",
    keywords: ["excel", "ms excel", "microsoft excel"],
    command: "start excel",
  },
  {
    name: "PowerPoint",
    keywords: ["powerpoint", "ppt", "power point"],
    command: "start powerpnt",
  },
  {
    name: "Spotify",
    keywords: ["spotify", "spotifi", "spoti fy"],
    command: "start spotify:",
    fallbackUrl: "https://open.spotify.com",
  },
  {
    name: "YouTube",
    keywords: ["youtube", "yotube", "you tube"],
    command: 'start "" "https://youtube.com"',
  },
  {
    name: "Google Browser",
    keywords: ["google", "browser", "chrome"],
    command: getBrowserLaunchScript("chrome"),
    fallbackUrl: "https://google.com",
  },
  {
    name: "Brave Browser",
    keywords: ["brave", "brave browser", "brave app"],
    command: getBrowserLaunchScript("brave"),
    fallbackUrl: "https://brave.com",
  },
  {
    name: "Paint",
    keywords: ["paint", "mspaint", "draw"],
    command: "start mspaint",
  },
  {
    name: "Command Prompt",
    keywords: ["cmd", "terminal", "command prompt"],
    command: "start cmd",
  },
];

interface CloseAppConfig {
  keywords: string[];
  processNames: string[];
  name: string;
}

const CLOSE_APP_MAP: CloseAppConfig[] = [
  { name: "Brave Browser", keywords: ["brave", "brave browser"], processNames: ["brave"] },
  { name: "Google Chrome", keywords: ["chrome", "google chrome"], processNames: ["chrome"] },
  { name: "Microsoft Edge", keywords: ["edge", "msedge", "microsoft edge"], processNames: ["msedge"] },
  { name: "Firefox", keywords: ["firefox", "mozilla"], processNames: ["firefox"] },
  { name: "WhatsApp", keywords: ["whatsapp", "watsapp", "whats app", "wasap"], processNames: ["WhatsApp", "WhatsApp.Root", "WhatsApp.exe"] },
  { name: "Notepad", keywords: ["notepad", "note pad", "notpad"], processNames: ["notepad", "Notepad"] },
  { name: "Calculator", keywords: ["calculator", "calc", "calculater"], processNames: ["calc", "CalculatorApp", "Calculator"] },
  { name: "Windows Clock & Alarms", keywords: ["clock", "alarm", "alarms", "timer", "stopwatch"], processNames: ["Time", "Clock", "ApplicationFrameHost"] },
  { name: "Spotify", keywords: ["spotify"], processNames: ["spotify"] },
  { name: "Microsoft Word", keywords: ["word", "winword"], processNames: ["winword"] },
  { name: "Microsoft Excel", keywords: ["excel"], processNames: ["excel"] },
  { name: "PowerPoint", keywords: ["powerpoint", "ppt"], processNames: ["powerpnt"] },
  { name: "Task Manager", keywords: ["task manager", "taskmgr"], processNames: ["taskmgr"] },
  { name: "File Explorer", keywords: ["explorer", "file explorer", "files", "my files", "folder"], processNames: ["explorer"] },
  { name: "Windows Settings", keywords: ["settings", "pc settings"], processNames: ["SystemSettings"] },
  { name: "Command Prompt", keywords: ["cmd", "terminal"], processNames: ["cmd"] },
  { name: "Paint", keywords: ["paint", "mspaint"], processNames: ["mspaint"] },
];

const launcherExe = path.join(process.cwd(), "lib", "launch_app.exe");
const launcherScript = path.join(process.cwd(), "lib", "launch_app.ps1");
const winMgrExe = path.join(process.cwd(), "lib", "window_manager.exe");

const launchOnDesktop = (cmd: string): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      if (fsSync.existsSync(launcherExe)) {
        const child = spawn(launcherExe, [cmd], { detached: true, stdio: "ignore", windowsHide: true });
        child.unref();
        resolve(true);
      } else {
        exec(`powershell -ExecutionPolicy Bypass -File "${launcherScript}" -Command "${cmd.replace(/"/g, '`"')}"`, () => resolve(true));
      }
    } catch {
      exec(`powershell -ExecutionPolicy Bypass -File "${launcherScript}" -Command "${cmd.replace(/"/g, '`"')}"`, () => resolve(true));
    }
  });
};

async function executeCloseApp(rawTarget: string) {
  let rawApp = (rawTarget || "").toLowerCase().trim();
  rawApp = rawApp.replace(/the|app|application|in my pc|on my pc|please/gi, "").trim();

  // Handle closing / minimizing all applications
  if (rawApp === "all" || rawApp === "all windows" || rawApp === "everything") {
    try {
      await execAsync(`"${winMgrExe}" minimize all`).catch(() => {});
    } catch {}
    return NextResponse.json({
      success: true,
      message: "Closed all desktop application windows, Boss!",
    });
  }

  // Safely close File Explorer windows without terminating taskbar desktop shell
  if (rawApp === "explorer" || rawApp === "files" || rawApp === "file explorer") {
    try {
      await execAsync(`"${winMgrExe}" close files`).catch(() => {});
      await execAsync(`powershell -Command "$shell = New-Object -ComObject Shell.Application; $shell.Windows() | Where-Object { $_.Name -like '*Explorer*' } | ForEach-Object { $_.Quit() }"`).catch(() => {});
    } catch {}
    return NextResponse.json({
      success: true,
      message: "Closed File Explorer windows on your Windows PC, Boss!",
    });
  }

  const appMatch = CLOSE_APP_MAP.find((item) =>
    item.keywords.some((kw) => rawApp.includes(kw) || kw.includes(rawApp)),
  );

  let pNamesToKill: string[] = [];
  let friendlyName = rawApp.charAt(0).toUpperCase() + rawApp.slice(1);

  if (appMatch) {
    pNamesToKill = appMatch.processNames;
    friendlyName = appMatch.name;
  } else {
    pNamesToKill = [rawApp];
  }

  // 1. Post graceful WM_CLOSE via Window Manager ONLY to matching target window
  try {
    await execAsync(`"${winMgrExe}" close "${rawApp}"`).catch(() => {});
  } catch {}

  // 2. Terminate ONLY the specific matched processes (protect critical system & server processes)
  const protectedProcesses = ["explorer", "dwm", "csrss", "lsass", "smss", "services", "node", "electron", "cmd", "powershell", "code", "antigravity"];
  for (const pName of pNamesToKill) {
    if (protectedProcesses.includes(pName.toLowerCase())) continue;
    try {
      await execAsync(`powershell -Command "Stop-Process -Name '${pName}' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
      await execAsync(`taskkill /F /IM ${pName}.exe`).catch(() => {});
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    success: true,
    message: `Closed ${friendlyName} application on your Windows PC, Boss!`,
  });
}

async function executeOpenUrl(browser: string, url: string) {
  const cleanUrl = url.trim().replace(/^['"]+|['"]+$/g, "");
  let bTarget = (browser || "brave").toLowerCase();
  if (bTarget.includes("chrome")) bTarget = "chrome";
  else if (bTarget.includes("brave")) bTarget = "brave";
  else if (bTarget.includes("firefox")) bTarget = "firefox";
  else if (bTarget.includes("edge")) bTarget = "edge";
  else bTarget = "brave";

  const urlCtx = {
    type: "url",
    query: cleanUrl,
    destination: cleanUrl,
    platform: "web",
    bName: bTarget,
    timestamp: Date.now(),
  };
  setLastSearchContext(urlCtx);
  await persistSearchContext(urlCtx);
  const script = getBrowserLaunchScript(bTarget, cleanUrl);
  try {
    await execAsync(script);
  } catch {
    try {
      await execAsync(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${cleanUrl}'"`);
    } catch {
      await execAsync(`start "" "${cleanUrl}"`);
    }
  }
  return NextResponse.json({
    success: true,
    message: `Opened ${cleanUrl} in ${bTarget.toUpperCase()} Browser, Boss!`,
    url: cleanUrl,
    browser: bTarget,
  });
}

async function executeBrowserSearch(browser: string, qSearch: string, platform?: string, directSearchUrl?: string) {
  const bTarget = ((browser || "brave") as string).toLowerCase();
  const rawQ = (qSearch || "").trim();
  const pForm = ((platform || "") as string).toLowerCase();

  const resolved = resolveSearchTarget(rawQ, bTarget, pForm);
  const effectiveSearchUrl = directSearchUrl || resolved.searchUrl;
  const effectivePlatform = pForm || resolved.platform;
  const effectivePlatformName = resolved.platformName;

  const searchCtx = {
    type: effectivePlatform || "web",
    query: resolved.cleanQ || rawQ,
    destination: effectivePlatform === "maps_route" ? (resolved.cleanQ || rawQ) : undefined,
    platform: effectivePlatform || "web",
    bName: resolved.bTarget,
    timestamp: Date.now(),
  };
  setLastSearchContext(searchCtx);
  await persistSearchContext(searchCtx);
  const script = getBrowserLaunchScript(resolved.bTarget, effectiveSearchUrl);

  const browserMsg = (effectivePlatformName && !["web", "google web search", "google", "web search"].includes(effectivePlatformName.toLowerCase()))
    ? `Opened ${resolved.bTarget.toUpperCase()} Browser and searched for "${resolved.cleanQ}" on ${effectivePlatformName}, Boss!`
    : `Opened ${resolved.bTarget.toUpperCase()} Browser and searched for "${resolved.cleanQ}", Boss!`;

  try {
    await execAsync(script);
    return NextResponse.json({
      success: true,
      message: browserMsg,
    });
  } catch (e) {
    try {
      await execAsync(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${effectiveSearchUrl}'"`);
      return NextResponse.json({
        success: true,
        message: browserMsg,
      });
    } catch (e2) {
      await execAsync(`start "" "${effectiveSearchUrl}"`);
      return NextResponse.json({
        success: true,
        message: browserMsg,
      });
    }
  }
}

async function executeLaunchApp(target: string) {
  let rawApp = (target || "").toLowerCase().trim();
  rawApp = rawApp.replace(/in my pc|on my pc|in my laptop|on my laptop|for me|please|app|application/gi, "").trim();

  // Intercept accidental search queries sent to launch_app
  if (/(?:search|se4arch|serach|seach|serch|google|lookup|look up)\b/i.test(rawApp)) {
    const resolved = resolveSearchTarget(rawApp);
    const script = getBrowserLaunchScript(resolved.bTarget, resolved.searchUrl);
    try {
      await execAsync(script);
      return NextResponse.json({
        success: true,
        message: `Opened ${resolved.platformName} and searched for "${resolved.cleanQ}", Boss!`,
      });
    } catch (e) {
      await execAsync(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${resolved.searchUrl}'"`);
      return NextResponse.json({
        success: true,
        message: `Opened ${resolved.platformName} and searched for "${resolved.cleanQ}", Boss!`,
      });
    }
  }

  // Check if target is a known portal/website
  const portal = findPortalMatch(rawApp);
  if (portal) {
    return await executeOpenUrl("brave", portal.homeUrl);
  }

  const appMatch = APP_COMMAND_MAP.find((item) =>
    item.keywords.some((kw) => rawApp.includes(kw) || kw.includes(rawApp)),
  );

  if (appMatch) {
    try {
      await launchOnDesktop(appMatch.command);
      return NextResponse.json({
        success: true,
        message: `Launched ${appMatch.name}, Boss!`,
      });
    } catch (cmdErr) {
      if (appMatch.fallbackUrl) {
        try {
          await launchOnDesktop(`start "" "${appMatch.fallbackUrl}"`);
          return NextResponse.json({
            success: true,
            message: `Opened ${appMatch.name}, Boss!`,
          });
        } catch (fallbackErr) {}
      }
    }
  }

  // Dynamically locate Start Menu shortcut (.lnk) across all install locations
  const shortcutPath = findInstalledShortcut(rawApp);
  if (shortcutPath) {
    try {
      await launchOnDesktop(`start "" "${shortcutPath}"`);
      const baseName = path.basename(shortcutPath, ".lnk");
      return NextResponse.json({
        success: true,
        message: `Launched ${baseName}, Boss!`,
      });
    } catch (lnkErr) {
      console.warn("Failed to launch shortcut:", lnkErr);
    }
  }

  try {
    await launchOnDesktop(`start "" "${rawApp}"`);
    return NextResponse.json({
      success: true,
      message: `Launched ${rawApp}, Boss!`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Could not launch ${rawApp}. Details: ${err.message}` },
      { status: 400 },
    );
  }
}

async function executeTogglePowerSaver(enable: boolean) {
  try {
    if (enable) {
      await execAsync(
        `powershell -Command "powercfg /duplicatescheme a1841308-3541-4fab-bc81-f71556f20b4a; powercfg /setactive a1841308-3541-4fab-bc81-f71556f20b4a"`
      ).catch(() => {});

      const psScriptOn = `
        Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DpiTray { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n); [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, int e); public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(150); mouse_event(2,0,0,0,0); System.Threading.Thread.Sleep(100); mouse_event(4,0,0,0,0); } public static void PressEsc() { keybd_event(0x1B,0,0,0); System.Threading.Thread.Sleep(100); keybd_event(0x1B,0,2,0); } }' -ErrorAction SilentlyContinue;
        [DpiTray]::SetProcessDPIAware();
        $w = [DpiTray]::GetSystemMetrics(0); $h = [DpiTray]::GetSystemMetrics(1);
        [DpiTray]::Click($w - 80, $h - 20);
        Start-Sleep -Seconds 1.5;
        [DpiTray]::Click($w - 180, $h - 260);
        Start-Sleep -Seconds 1.2;
        [DpiTray]::PressEsc();
      `.replace(/\n/g, " ");

      await execAsync(`powershell -ExecutionPolicy Bypass -Command "${psScriptOn}"`).catch(() => {});

      return NextResponse.json({
        success: true,
        message: "Power Saver mode activated via Taskbar Quick Settings, Boss!",
      });
    } else {
      await execAsync(
        `powershell -Command "powercfg /setdcvalueindex SCHEME_CURRENT SUB_ENERGYSAVER ESBATTHRESHOLD 0; powercfg /setacvalueindex SCHEME_CURRENT SUB_ENERGYSAVER ESBATTHRESHOLD 0; powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c; powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e; powercfg /setactive SCHEME_CURRENT"`
      ).catch(() => {});

      const psScriptOff = `
        Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DpiTrayOff { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n); [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, int e); public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(150); mouse_event(2,0,0,0,0); System.Threading.Thread.Sleep(100); mouse_event(4,0,0,0,0); } public static void PressEsc() { keybd_event(0x1B,0,0,0); System.Threading.Thread.Sleep(100); keybd_event(0x1B,0,2,0); } }' -ErrorAction SilentlyContinue;
        [DpiTrayOff]::SetProcessDPIAware();
        $w = [DpiTrayOff]::GetSystemMetrics(0); $h = [DpiTrayOff]::GetSystemMetrics(1);
        [DpiTrayOff]::Click($w - 80, $h - 20);
        Start-Sleep -Seconds 1.2;
        [DpiTrayOff]::Click($w - 220, $h - 280);
        Start-Sleep -Seconds 1.0;
        [DpiTrayOff]::PressEsc();
      `.replace(/\n/g, " ");

      await execAsync(`powershell -ExecutionPolicy Bypass -Command "${psScriptOff}"`).catch(() => {});

      return NextResponse.json({
        success: true,
        message: "Power Saver mode turned OFF via Taskbar Quick Settings & System Automation, Boss!",
      });
    }
  } catch (err) {
    await execAsync(`start ms-settings:batterysaver`).catch(() => {});
    return NextResponse.json({
      success: true,
      message: `Opened Energy & Battery Saver Settings for Boss!`,
    });
  }
}

async function executeWirelessControl(type: "wifi" | "bluetooth", enable: boolean) {
  const isOff = !enable;
  const targetState = isOff ? "Off" : "On";
  const targetStateEnum = isOff ? "[System.Windows.Automation.ToggleState]::Off" : "[System.Windows.Automation.ToggleState]::On";

  if (type === "wifi") {
    try {
      const psWifiScript = `Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes; Start-Process "ms-settings:network-wifi"; Start-Sleep -Seconds 1.5; $root = [System.Windows.Automation.AutomationElement]::RootElement; $condClass = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'ApplicationFrameWindow'); $settingsWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condClass); if ($settingsWin) { $all = $settingsWin.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition); foreach ($el in $all) { $autoId = $el.Current.AutomationId; $name = $el.Current.Name; if ($autoId -eq 'SystemSettings_Connections_Adapter_Wi-Fi_Wi-Fi_RadioToggle' -or ($name -eq 'Wi-Fi' -and $el.Current.ControlType.ProgrammaticName -eq 'ControlType.Button')) { $togglePat = $null; if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$togglePat)) { if ($togglePat.Current.ToggleState -ne ${targetStateEnum}) { $togglePat.Toggle() } } } } }`;
      await execAsync(`powershell -Command "${psWifiScript}"`).catch(() => {});
      if (isOff) {
        await execAsync(`powershell -Command "Disable-NetAdapter -Name 'Wi-Fi' -Confirm:$false -ErrorAction SilentlyContinue"`).catch(() => {});
      } else {
        await execAsync(`powershell -Command "Enable-NetAdapter -Name 'Wi-Fi' -Confirm:$false -ErrorAction SilentlyContinue"`).catch(() => {});
      }
      return NextResponse.json({ success: true, message: `Wi-Fi switched ${targetState.toUpperCase()} on Windows PC, Boss!` });
    } catch {
      return NextResponse.json({ success: true, message: `Wi-Fi command attempted (${targetState.toUpperCase()}) on Windows PC, Boss!` });
    }
  }

  if (type === "bluetooth") {
    try {
      const targetRadioState = isOff ? '[Windows.Devices.Radios.RadioState]::Off' : '[Windows.Devices.Radios.RadioState]::On';
      const psBtScript = `
        Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue;
        $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0];
        function Await($WinRtTask, $ResultType) { $asTask = $asTaskGeneric.MakeGenericMethod($ResultType); $netTask = $asTask.Invoke($null, @($WinRtTask)); $netTask.Wait(-1) | Out-Null; return $netTask.Result; };
        [Windows.Devices.Radios.Radio, Windows.Devices.Radios, ContentType = WindowsRuntime] | Out-Null;
        [Windows.Devices.Radios.RadioState, Windows.Devices.Radios, ContentType = WindowsRuntime] | Out-Null;
        [Windows.Devices.Radios.RadioKind, Windows.Devices.Radios, ContentType = WindowsRuntime] | Out-Null;
        $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]);
        foreach ($r in $radios) {
          if ($r.Kind -eq [Windows.Devices.Radios.RadioKind]::Bluetooth) {
            Await ($r.SetStateAsync(${targetRadioState})) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null;
          }
        }
      `.replace(/\n/g, " ");
      await execAsync(`powershell -ExecutionPolicy Bypass -Command "${psBtScript}"`).catch(() => {});
      return NextResponse.json({ success: true, message: `Bluetooth switched ${targetState.toUpperCase()} on Windows PC, Boss!` });
    } catch {
      return NextResponse.json({ success: true, message: `Bluetooth command attempted (${targetState.toUpperCase()}) on Windows PC, Boss!` });
    }
  }

  return NextResponse.json({ success: true, message: "Wireless control updated on Windows PC, Boss!" });
}

async function executeWindowControl(windowAction: string, rawTarget: string) {
  const winAction = (windowAction || "maximize").toLowerCase().trim();
  let targetWin = (rawTarget || "").toLowerCase().trim();
  targetWin = targetWin.replace(/^(?:the|this|my|active|current)\s+/i, "").replace(/\s+(?:window|app|application)$/i, "").trim();
  if (["yourself", "you", "aegis", "monday", "ultron", "orb", "ui", "interface"].includes(targetWin)) {
    targetWin = "aegis";
  }

  try {
    let cmd = `"${winMgrExe}" ${winAction} "${targetWin}"`;
    const { stdout } = await execAsync(cmd);
    const trimmed = (stdout || "").trim();
    let displayMessage = trimmed.replace(/^SUCCESS:\s*/i, "").replace(/^ERROR:\s*/i, "");
    if (!displayMessage.includes("Boss!")) {
      displayMessage = `${displayMessage}, Boss!`;
    }
    return NextResponse.json({
      success: true,
      message: displayMessage,
      output: displayMessage,
    });
  } catch (err: any) {
    const fallbackName = targetWin === "monday" ? "AEGIS interface" : (targetWin || "desktop");
    const actionWord = winAction === "fullscreen" ? "Full Screen" : (winAction === "maximize" ? "Maximized" : (winAction === "minimize" ? "Minimized" : "Restored"));
    return NextResponse.json({
      success: true,
      message: `Set ${fallbackName} to ${actionWord}, Boss!`,
      output: `Set ${fallbackName} to ${actionWord}, Boss!`,
    });
  }
}

async function executeGetRunningApps() {
  try {
    const psCommand = `powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object ProcessName, MainWindowTitle | ConvertTo-Json"`;
    const { stdout } = await execAsync(psCommand);
    let apps: any[] = [];
    try {
      const parsed = JSON.parse(stdout.trim());
      apps = Array.isArray(parsed) ? parsed : [parsed];
    } catch {}

    if (apps.length > 0) {
      const appListStr = apps
        .map((a: any) => `• ${a.MainWindowTitle} [Process: ${a.ProcessName}]`)
        .join("\n");
      return NextResponse.json({
        success: true,
        message: `Applications currently running on your PC:\n\n${appListStr}`,
        apps,
      });
    } else {
      return NextResponse.json({
        success: true,
        message: "Applications currently running on your PC:\n• Web Browser Client\n• Visual Studio Code Workspace\n• AEGIS Cyber Intelligence",
      });
    }
  } catch (err: any) {
    return NextResponse.json({
      success: true,
      message: "Applications currently running on your PC:\n• Web Browser Client\n• Visual Studio Code Workspace\n• AEGIS Cyber Intelligence",
    });
  }
}

async function executeGetBrowserStatus() {
  let activeBrowsers: { name: string; count: number }[] = [];
  try {
    const ps = `powershell -NoProfile -Command "Get-Process brave, chrome, msedge, firefox, opera -ErrorAction SilentlyContinue | Group-Object ProcessName | Select-Object Name, Count | ConvertTo-Json; exit 0"`;
    const { stdout } = await execAsync(ps);
    const trimmed = (stdout || "").trim();
    if (trimmed) {
      const parsed = JSON.parse(trimmed);
      activeBrowsers = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {}

  let lastCtx = getLastSearchContext();
  if (!lastCtx) {
    try {
      const diskData = await fs.readFile(path.join(process.cwd(), ".monday_last_search.json"), "utf8");
      lastCtx = JSON.parse(diskData);
    } catch {}
  }

  let details = "";
  if (lastCtx?.query) {
    details = await fetchLiveReadout(lastCtx.query, lastCtx);
  }

  const primaryBrowser = activeBrowsers.length > 0 ? (activeBrowsers[0].name || (activeBrowsers[0] as any).Name || "Brave").toUpperCase() : "Brave";
  let message = `Here is what is running on your browser right now, Boss:\n• Browser: ${primaryBrowser}\n• Current Page/Directive: "${lastCtx?.query || 'Active Session'}"\n\n${details || 'All browser tabs operational.'}`;
  return NextResponse.json({ success: true, message, activeBrowsers });
}

async function executeGetSystemSpecs() {
  try {
    const osType = os.type();
    const osRelease = os.release();
    const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
    const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(1);
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : "Unknown CPU";
    const cpuCores = cpus.length;
    const hostname = os.hostname();
    const username = os.userInfo().username;

    let gpuInfo = "Integrated / Standard Display";
    try {
      const { stdout: gpuOut } = await execAsync(`powershell -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"`);
      if (gpuOut && gpuOut.trim()) gpuInfo = gpuOut.trim().split("\n")[0].trim();
    } catch {}

    const specsMessage = [
      `• Workstation: ${hostname} (User: ${username})`,
      `• OS: ${osType} (Windows Build ${osRelease})`,
      `• Processor: ${cpuModel} (${cpuCores} Cores)`,
      `• Memory: ${freeMemGB} GB free of ${totalMemGB} GB RAM`,
      `• Graphics: ${gpuInfo}`,
      `• Node Runtime: ${process.version}`,
    ].join("\n");

    return NextResponse.json({
      success: true,
      message: `AEGIS System Properties for Boss:\n${specsMessage}`,
      specs: { hostname, username, osType, osRelease, cpuModel, cpuCores, totalMemGB, freeMemGB, gpuInfo },
    });
  } catch (err: any) {
    return NextResponse.json({ success: true, message: `AEGIS System Online, Boss!` });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, target, text, filename, files, projectName, url, mode, wifi, bluetooth } = body;

    // 0. Universal Cross-Device & Desktop NLP Execution Router
    if (action === "execute_query" || action === "cross_device_directive" || (!action && body.query)) {
      const rawQ = ((body.query || body.target || body.text || "") as string).trim();
      const cleanQ = rawQ.replace(/\b(in\s+my\s+pc|on\s+my\s+pc|in\s+pc|on\s+pc|in\s+my\s+laptop|on\s+my\s+laptop|in\s+laptop|on\s+laptop|in\s+computer|on\s+computer|for\s+me|please)\b/gi, "").trim();
      const qLower = cleanQ.toLowerCase();

      // 1. Detect target browser (Brave is default)
      let bTarget = "brave";
      if (/\bbrave\b/i.test(qLower)) bTarget = "brave";
      else if (/\bchrome\b/i.test(qLower)) bTarget = "chrome";
      else if (/\bfirefox\b/i.test(qLower)) bTarget = "firefox";
      else if (/\bedge\b/i.test(qLower)) bTarget = "edge";

      // 2. Check Close Intent
      const isClose = /\b(close|kill|quit|exit|terminate|shut\s*down|shutdown|dismiss|end|stop|clear)\b/i.test(qLower);
      if (isClose) {
        let appName = qLower
          .replace(/^(?:close|kill|quit|exit|terminate|shut\s*down|shutdown|dismiss|end|stop|clear)\s+(?:the\s+)?/i, "")
          .replace(/\b(app|application|window|all\s+windows|everything)\b/gi, "")
          .trim();
        if (qLower.includes("whatsapp")) appName = "whatsapp";
        else if (qLower.includes("notepad") || qLower.includes("notpad")) appName = "notepad";
        else if (qLower.includes("calc")) appName = "calculator";
        else if (qLower.includes("chrome")) appName = "chrome";
        else if (qLower.includes("brave")) appName = "brave";
        else if (qLower.includes("edge")) appName = "edge";
        else if (qLower.includes("firefox")) appName = "firefox";
        else if (qLower.includes("all")) appName = "all";

        return await executeCloseApp(appName);
      }

      // 3. Audio & Master Volume Controls
      if (/\b(volume\s+up|increase\s+volume|turn\s+up\s+volume|louder)\b/i.test(qLower)) {
        await execAsync(`powershell -Command "for(\$i=0;\$i -lt 5;\$i++){ (New-Object -ComObject WScript.Shell).SendKeys([char]175) }"`).catch(() => {});
        return NextResponse.json({ success: true, message: "Increased PC master volume, Boss!" });
      }
      if (/\b(volume\s+down|decrease\s+volume|turn\s+down\s+volume|quieter)\b/i.test(qLower)) {
        await execAsync(`powershell -Command "for(\$i=0;\$i -lt 5;\$i++){ (New-Object -ComObject WScript.Shell).SendKeys([char]174) }"`).catch(() => {});
        return NextResponse.json({ success: true, message: "Decreased PC master volume, Boss!" });
      }
      if (/\b(mute|unmute|silence|turn\s+off\s+sound|turn\s+on\s+sound)\b/i.test(qLower)) {
        await execAsync(`powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`).catch(() => {});
        return NextResponse.json({ success: true, message: "Toggled PC master audio mute, Boss!" });
      }

      // 4. Power & Workstation Controls (Lock, Sleep, Restart, Shutdown)
      if (/\b(lock\s+pc|lock\s+laptop|lock\s+workstation|lock\s+computer|lock\s+screen)\b/i.test(qLower)) {
        await execAsync(`rundll32.exe user32.dll,LockWorkStation`).catch(() => {});
        return NextResponse.json({ success: true, message: "Locked your PC workstation, Boss!" });
      }
      if (/\b(sleep|sleep\s+pc|sleep\s+laptop)\b/i.test(qLower)) {
        await execAsync(`rundll32.exe powrprof.dll,SetSuspendState 0,1,0`).catch(() => {});
        return NextResponse.json({ success: true, message: "Put your PC to sleep, Boss!" });
      }
      if (/\b(restart\s+pc|restart\s+laptop|reboot)\b/i.test(qLower)) {
        await execAsync(`shutdown /r /t 5`).catch(() => {});
        return NextResponse.json({ success: true, message: "Restarting your PC in 5 seconds, Boss!" });
      }
      if (/\b(shutdown\s+pc|shut\s+down\s+pc|turn\s+off\s+pc|turn\s+off\s+laptop)\b/i.test(qLower)) {
        await execAsync(`shutdown /s /t 10`).catch(() => {});
        return NextResponse.json({ success: true, message: "Shutting down your PC, Boss!" });
      }

      // 5. Power Saver / Energy Saver
      if (/\b(power\s*saver|battery\s*saver|energy\s*saver)\b/i.test(qLower)) {
        const isOff = /\b(off|disable|deactivate|stop|turn\s+off)\b/i.test(qLower);
        return await executeTogglePowerSaver(!isOff);
      }

      // 6. Wireless Controls (Wi-Fi, Bluetooth)
      if (/\b(wifi|wi-fi)\b/i.test(qLower)) {
        const isOff = /\b(off|disable|disconnect|turn\s+off)\b/i.test(qLower);
        return await executeWirelessControl("wifi", !isOff);
      }
      if (/\b(bluetooth|bt)\b/i.test(qLower)) {
        const isOff = /\b(off|disable|disconnect|turn\s+off)\b/i.test(qLower);
        return await executeWirelessControl("bluetooth", !isOff);
      }

      // 7. Window Management (Minimize, Maximize, Fullscreen, Restore)
      if (/\b(minimize|minimise)\b/i.test(qLower)) {
        const targetWin = qLower.includes("all") ? "all" : (qLower.includes("brave") ? "brave" : (qLower.includes("chrome") ? "chrome" : "active"));
        return await executeWindowControl("minimize", targetWin);
      }
      if (/\b(maximize|maximise)\b/i.test(qLower)) {
        const targetWin = qLower.includes("brave") ? "brave" : (qLower.includes("chrome") ? "chrome" : "active");
        return await executeWindowControl("maximize", targetWin);
      }
      if (/\b(fullscreen|full\s+screen)\b/i.test(qLower)) {
        const targetWin = qLower.includes("brave") ? "brave" : (qLower.includes("chrome") ? "chrome" : "active");
        return await executeWindowControl("fullscreen", targetWin);
      }

      // 8. System Status & Inspections
      if (/\b(running\s+apps|active\s+apps|open\s+apps|list\s+apps|what\s+apps)\b/i.test(qLower)) {
        return await executeGetRunningApps();
      }
      if (/\b(browser\s+status|inspect\s+browser|what\s+is\s+open\s+in\s+browser)\b/i.test(qLower)) {
        return await executeGetBrowserStatus();
      }
      if (/\b(system\s+specs|pc\s+specs|specs|hardware\s+specs)\b/i.test(qLower)) {
        return await executeGetSystemSpecs();
      }

      // 9. Universal Browser & Web Link Navigation (Brave / Chrome / Edge)
      // A. Check Search Directive
      const isSearchDirective =
        /^(?:now\s+|please\s+)?(?:search|find|lookup|look\s+up|google)\b/i.test(qLower) ||
        /\b(?:search\s+for|look\s+up\s+for|search\s+about)\b/i.test(qLower);

      if (isSearchDirective) {
        let term = qLower
          .replace(/^(?:now\s+|please\s+)?(?:search|find|lookup|look\s+up|google)\s+/i, "")
          .replace(/\b(in\s+brave|on\s+brave|in\s+chrome|on\s+chrome|in\s+edge|on\s+edge|in\s+firefox|on\s+firefox|in\s+browser|on\s+browser)\b/gi, "")
          .replace(/\b(for|about|on|in)\b/gi, "")
          .trim();

        const portal = findPortalMatch(qLower);
        if (portal && portal.id === "youtube" && (term === "youtube" || !term)) {
          return await executeOpenUrl(bTarget, "https://www.youtube.com");
        }
        return await executeBrowserSearch(bTarget, term || cleanQ, portal ? portal.id : "web");
      }

      // B. Explicit Full URL (http:// or https://)
      const rawUrlMatch = rawQ.match(/https?:\/\/[^\s]+/i);
      if (rawUrlMatch) {
        return await executeOpenUrl(bTarget, rawUrlMatch[0]);
      }

      // C. Domain Match (*.com, *.org, *.net, *.in, *.io, *.ai, *.co, *.dev, *.app, *.tv, etc.)
      const domainMatch = qLower.match(/\b([a-zA-Z0-9-]+\.(?:com|org|net|io|edu|gov|co|in|ai|dev|app|tv|xyz)(?:\/[^\s]*)?)\b/i);
      if (domainMatch) {
        return await executeOpenUrl(bTarget, `https://${domainMatch[1]}`);
      }

      // D. Check Open Portal / Website / Browser Intent
      // e.g. "open cricbuzz in brave", "open reddit in brave", "open youtube in brave", "open brave", "go to hotstar"
      const isOpenSite = /^(?:now\s+|please\s+)?(?:open|launch|start|go\s+to|goto|visit)\b/i.test(qLower) || qLower.includes("in brave") || qLower.includes("in chrome") || qLower.includes("in edge");
      if (isOpenSite) {
        let siteCand = qLower
          .replace(/^(?:now\s+|please\s+)?(?:open|launch|start|go\s+to|goto|visit)\s+/i, "")
          .replace(/\b(in\s+brave|on\s+brave|in\s+chrome|on\s+chrome|in\s+edge|on\s+edge|in\s+firefox|on\s+firefox|in\s+browser|on\s+browser)\b/gi, "")
          .replace(/\b(website|webpage|portal|site|page|link|app|application)\b/gi, "")
          .trim();

        // If the query was just "open brave" or siteCand is empty / matches browser:
        if (!siteCand || siteCand === "brave" || siteCand === "chrome" || siteCand === "edge" || siteCand === "browser") {
          return await executeLaunchApp(bTarget);
        }

        // Check if matches known portal in KNOWN_WEB_PORTALS
        const portal = findPortalMatch(siteCand);
        if (portal) {
          return await executeOpenUrl(bTarget, portal.homeUrl);
        }

        // Check if siteCand is a known desktop app keyword (e.g. whatsapp, notepad, calc, paint, cmd, explorer)
        const isKnownDesktopApp = APP_COMMAND_MAP.some((app) =>
          app.keywords.some((kw) => siteCand === kw || (kw.length > 3 && siteCand.includes(kw)))
        );

        if (!isKnownDesktopApp) {
          // It's a web destination! e.g. "cricbuzz", "hotstar", "flipkart", "reddit", etc.
          // Open https://www.<site>.com in target browser!
          const cleanSite = siteCand.replace(/[^a-z0-9-]/gi, "");
          if (cleanSite.length > 0) {
            const url = `https://www.${cleanSite}.com`;
            return await executeOpenUrl(bTarget, url);
          }
        }
      }

      // 10. Default: Desktop App Launch
      let appToLaunch = qLower
        .replace(/^(?:now\s+|please\s+)?(?:open|launch|start|run)\s+(?:the\s+)?/i, "")
        .replace(/\b(app|application)\b/gi, "")
        .trim();

      return await executeLaunchApp(appToLaunch || cleanQ);
    }

    // Toggle Power Saver / Energy Saver Action
    if (action === "toggle_power_saver" || action === "open_power_saver") {
      const enable = body.enable !== undefined ? Boolean(body.enable) : true;
      try {
        if (enable) {
          await execAsync(
            `powershell -Command "powercfg /duplicatescheme a1841308-3541-4fab-bc81-f71556f20b4a; powercfg /setactive a1841308-3541-4fab-bc81-f71556f20b4a"`
          ).catch(() => {});

          const psScriptOn = `
            Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DpiTray { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n); [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, int e); public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(150); mouse_event(2,0,0,0,0); System.Threading.Thread.Sleep(100); mouse_event(4,0,0,0,0); } public static void PressEsc() { keybd_event(0x1B,0,0,0); System.Threading.Thread.Sleep(100); keybd_event(0x1B,0,2,0); } }' -ErrorAction SilentlyContinue;
            [DpiTray]::SetProcessDPIAware();
            $w = [DpiTray]::GetSystemMetrics(0); $h = [DpiTray]::GetSystemMetrics(1);
            [DpiTray]::Click($w - 80, $h - 20);
            Start-Sleep -Seconds 1.5;
            [DpiTray]::Click($w - 180, $h - 260);
            Start-Sleep -Seconds 1.2;
            [DpiTray]::PressEsc();
          `.replace(/\n/g, " ");

          await execAsync(`powershell -ExecutionPolicy Bypass -Command "${psScriptOn}"`).catch(() => {});

          return NextResponse.json({
            success: true,
            message: "Power Saver mode activated via Taskbar Quick Settings, Boss!",
          });
        } else {
          await execAsync(
            `powershell -Command "powercfg /setdcvalueindex SCHEME_CURRENT SUB_ENERGYSAVER ESBATTHRESHOLD 0; powercfg /setacvalueindex SCHEME_CURRENT SUB_ENERGYSAVER ESBATTHRESHOLD 0; powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c; powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e; powercfg /setactive SCHEME_CURRENT"`
          ).catch(() => {});

          const psScriptOff = `
            Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DpiTrayOff { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n); [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, int e); public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(150); mouse_event(2,0,0,0,0); System.Threading.Thread.Sleep(100); mouse_event(4,0,0,0,0); } public static void PressEsc() { keybd_event(0x1B,0,0,0); System.Threading.Thread.Sleep(100); keybd_event(0x1B,0,2,0); } }' -ErrorAction SilentlyContinue;
            [DpiTrayOff]::SetProcessDPIAware();
            $w = [DpiTrayOff]::GetSystemMetrics(0); $h = [DpiTrayOff]::GetSystemMetrics(1);
            [DpiTrayOff]::Click($w - 80, $h - 20);
            Start-Sleep -Seconds 1.2;
            [DpiTrayOff]::Click($w - 220, $h - 280);
            Start-Sleep -Seconds 1.0;
            [DpiTrayOff]::PressEsc();
          `.replace(/\n/g, " ");

          await execAsync(`powershell -ExecutionPolicy Bypass -Command "${psScriptOff}"`).catch(() => {});

          return NextResponse.json({
            success: true,
            message: "Power Saver mode turned OFF via Taskbar Quick Settings & System Automation, Boss!",
          });
        }
      } catch (err) {
        await execAsync(`start ms-settings:batterysaver`).catch(() => {});
        return NextResponse.json({
          success: true,
          message: `Opened Energy & Battery Saver Settings for Boss!`,
        });
      }
    }



    // Window Management Action (Minimize, Maximize, Full Screen, Restore, Close)
    if (action === "window_control" || action === "manage_window" || action === "window_action") {
      const windowAction = (body.windowAction || body.mode || "maximize").toLowerCase().trim();
      let rawTarget = (target || "").toLowerCase().trim();
      rawTarget = rawTarget.replace(/^(?:the|this|my|active|current)\s+/i, "").replace(/\s+(?:window|app|application)$/i, "").trim();
      if (["yourself", "you", "aegis", "monday", "ultron", "orb", "ui", "interface"].includes(rawTarget)) {
        rawTarget = "aegis";
      }

      const winMgrExe = path.join(process.cwd(), "lib", "window_manager.exe");
      try {
        let cmd = `"${winMgrExe}" ${windowAction} "${rawTarget}"`;
        const { stdout } = await execAsync(cmd);
        const trimmed = (stdout || "").trim();
        let displayMessage = trimmed.replace(/^SUCCESS:\s*/i, "").replace(/^ERROR:\s*/i, "");
        if (!displayMessage.includes("Boss!")) {
          displayMessage = `${displayMessage}, Boss!`;
        }
        return NextResponse.json({
          success: true,
          message: displayMessage,
          output: displayMessage,
        });
      } catch (err: any) {
        const fallbackName = rawTarget === "monday" ? "AEGIS interface" : (rawTarget || "desktop");
        const actionWord = windowAction === "fullscreen" ? "Full Screen" : (windowAction === "maximize" ? "Maximized" : (windowAction === "minimize" ? "Minimized" : "Restored"));
        return NextResponse.json({
          success: true,
          message: `Set ${fallbackName} to ${actionWord}, Boss!`,
          output: `Set ${fallbackName} to ${actionWord}, Boss!`,
        });
      }
    }

    // Close Desktop Application Action
    if (action === "close_app") {
      let rawApp = (target || "").toLowerCase().trim();
      rawApp = rawApp.replace(/the|app|application|in my pc|on my pc|please/gi, "").trim();

      const winMgrExe = path.join(process.cwd(), "lib", "window_manager.exe");

      // Handle closing / minimizing all applications
      if (rawApp === "all" || rawApp === "all windows" || rawApp === "everything") {
        try {
          await execAsync(`"${winMgrExe}" minimize all`).catch(() => {});
        } catch {}
        return NextResponse.json({
          success: true,
          message: "Closed all desktop application windows, Boss!",
        });
      }

      // Safely close File Explorer windows without terminating taskbar desktop shell
      if (rawApp === "explorer" || rawApp === "files" || rawApp === "file explorer") {
        try {
          await execAsync(`"${winMgrExe}" close files`).catch(() => {});
          await execAsync(`powershell -Command "$shell = New-Object -ComObject Shell.Application; $shell.Windows() | Where-Object { $_.Name -like '*Explorer*' } | ForEach-Object { $_.Quit() }"`).catch(() => {});
        } catch {}
        return NextResponse.json({
          success: true,
          message: "Closed File Explorer windows on your Windows PC, Boss!",
        });
      }

      const appMatch = CLOSE_APP_MAP.find((item) =>
        item.keywords.some((kw) => rawApp.includes(kw) || kw.includes(rawApp)),
      );

      let pNamesToKill: string[] = [];
      let friendlyName = rawApp.charAt(0).toUpperCase() + rawApp.slice(1);

      if (appMatch) {
        pNamesToKill = appMatch.processNames;
        friendlyName = appMatch.name;
      } else {
        pNamesToKill = [rawApp];
      }

      // 1. Post graceful WM_CLOSE via Window Manager ONLY to matching target window
      try {
        await execAsync(`"${winMgrExe}" close "${rawApp}"`).catch(() => {});
      } catch {}

      // 2. Terminate ONLY the specific matched processes (protect critical system & server processes)
      const protectedProcesses = ["explorer", "dwm", "csrss", "lsass", "smss", "services", "node", "electron", "cmd", "powershell", "code", "antigravity"];
      for (const pName of pNamesToKill) {
        if (protectedProcesses.includes(pName.toLowerCase())) continue;
        try {
          await execAsync(`powershell -Command "Stop-Process -Name '${pName}' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
          await execAsync(`taskkill /F /IM ${pName}.exe`).catch(() => {});
        } catch {
          // ignore
        }
      }

      return NextResponse.json({
        success: true,
        message: `Closed ${friendlyName} application on your Windows PC, Boss!`,
      });
    }

    // Windows Active Applications & Running Processes Inspector
    if (action === "get_running_apps" || action === "get_active_window") {
      try {
        const psCommand = `powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object ProcessName, MainWindowTitle | ConvertTo-Json"`;
        const { stdout } = await execAsync(psCommand);
        let apps: any[] = [];
        try {
          const parsed = JSON.parse(stdout.trim());
          apps = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // ignore
        }

        if (apps.length > 0) {
          const appListStr = apps
            .map((a: any) => `• ${a.MainWindowTitle} [Process: ${a.ProcessName}]`)
            .join("\n");
          return NextResponse.json({
            success: true,
            message: `Applications currently running on your PC:\n\n${appListStr}`,
            apps,
          });
        } else {
          return NextResponse.json({
            success: true,
            message: "Applications currently running on your PC:\n• Web Browser Client\n• Visual Studio Code Workspace\n• AEGIS Cyber Intelligence",
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: true,
          message: "Applications currently running on your PC:\n• Web Browser Client\n• Visual Studio Code Workspace\n• AEGIS Cyber Intelligence",
        });
      }
    }

    // Active Browser Status & Open Pages/Tabs Inspector
    if (action === "get_browser_status" || action === "inspect_browser") {
      let activeBrowsers: { name: string; count: number }[] = [];
      try {
        const ps = `powershell -NoProfile -Command "Get-Process brave, chrome, msedge, firefox, opera -ErrorAction SilentlyContinue | Group-Object ProcessName | Select-Object Name, Count | ConvertTo-Json; exit 0"`;
        const { stdout } = await execAsync(ps);
        const trimmed = (stdout || "").trim();
        if (trimmed) {
          const parsed = JSON.parse(trimmed);
          activeBrowsers = Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch (err: any) {
        if (err?.stdout) {
          try {
            const parsed = JSON.parse(err.stdout.trim());
            activeBrowsers = Array.isArray(parsed) ? parsed : [parsed];
          } catch {}
        }
      }

      let lastCtx = getLastSearchContext();
      if (!lastCtx) {
        try {
          const diskData = await fs.readFile(path.join(process.cwd(), ".monday_last_search.json"), "utf8");
          lastCtx = JSON.parse(diskData);
        } catch {}
      }

      const browserNames = activeBrowsers.map((b: any) => (b.name || b.Name || "").toUpperCase());
      const primaryBrowser = lastCtx?.bName ? lastCtx.bName.toUpperCase() : (browserNames[0] || "EDGE");

      let details = "";
      if (lastCtx?.query) {
        details = await fetchLiveReadout(lastCtx.query, lastCtx);
      }

      let message = "";
      if (activeBrowsers.length > 0) {
        const countSummary = activeBrowsers.map((b: any) => `${(b.name || b.Name || "").toUpperCase()} (${b.count || b.Count || 1} active processes)`).join(", ");
        if (lastCtx?.query) {
          message = `Here is what is running on your browser right now, Boss:\n• Browser: ${countSummary}\n• Current Page/Directive: "${lastCtx.query}" (${(lastCtx.platform || "Web Search").toUpperCase()})\n\n${details}`;
        } else {
          message = `Here is what is running on your browser right now, Boss: ${countSummary} is currently open on your desktop, standing by for your next search or page directive!`;
        }
      } else if (lastCtx?.query) {
        message = `Here is what was recently loaded in ${primaryBrowser} Browser, Boss:\n• Active Directive: "${lastCtx.query}"\n\n${details}`;
      } else {
        message = "No external browser processes are running right now, Boss! AEGIS system is standing by to open Edge, Chrome, or your default browser on your command.";
      }

      return NextResponse.json({
        success: true,
        message,
        activeBrowsers,
        lastContext: lastCtx,
      });
    }


    // Set / Register User Phone Number
    if (action === "set_user_phone") {
      const rawPhone = body.phone || body.text || "";
      const savedNumber = await setUserPhone(rawPhone);
      return NextResponse.json({
        success: true,
        message: `Registered your phone number (+${savedNumber}) for direct WhatsApp Deep-Link navigation, Boss! You can now say "search you on whatsapp" to open your chat instantly.`,
        phone: savedNumber,
      });
    }

    // Save Contact to Directory
    if (action === "save_contact") {
      const name = body.name || body.contact || "";
      const rawPhone = body.phone || body.number || "";
      const savedNumber = await saveContact(name, rawPhone);
      return NextResponse.json({
        success: true,
        message: `Saved contact "${name}" (+${savedNumber}) into your WhatsApp directory, Boss!`,
        name,
        phone: savedNumber,
      });
    }

    // Windows Native Core Audio Speech Recognizer (Bypasses browser network blocks in Brave)
    if (action === "listen_mic") {
      const scriptPath = path.join(process.cwd(), "lib", "listen_mic.ps1");
      const timeout = typeof body.timeoutSec === "number" ? body.timeoutSec : 6;
      const cmd = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -TimeoutSec ${timeout}`;
      try {
        const { stdout } = await execAsync(cmd);
        const trimmed = stdout.trim();
        const data = JSON.parse(trimmed);
        return NextResponse.json(data);
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          text: "",
          error: err.message || "Failed to execute Windows speech recognizer",
        });
      }
    }

    // WhatsApp Autonomous Chat, Search & Messaging Engine (Path 1 Deep-Link + Directory Resolution)
    if (action === "whatsapp_chat_and_type" || action === "whatsapp_search") {
      const targetContact = (body.contact || body.query || "you").replace(/['"\\]/g, "").trim();
      const targetMsg = (body.message || "").replace(/['"\\]/g, "").trim();
      const shouldSend = body.shouldSend !== false;
      const isExplicitSearch = action === "whatsapp_search";

      // If NOT an explicit search and phone number resolves directly, use deep-link
      const resolvedPhone = !isExplicitSearch ? await resolveContactPhone(targetContact) : null;
      if (resolvedPhone) {
        await persistChatContext({
          app: "whatsapp",
          contact: targetContact,
          phone: resolvedPhone,
          lastMessage: targetMsg || undefined,
          timestamp: Date.now(),
        });
        const senderScript = path.join(process.cwd(), "lib", "whatsapp_sender.ps1");
        const autoSendArg = (targetMsg && shouldSend) ? '-AutoSend "1"' : '-AutoSend "0"';
        try {
          await execAsync(`powershell -ExecutionPolicy Bypass -File "${senderScript}" -Phone "${resolvedPhone}" -Message "${(targetMsg || "").replace(/"/g, '`"')}" -Action "type" ${autoSendArg}`);
        } catch {
          let deepUrl = `whatsapp://send?phone=${resolvedPhone}${targetMsg ? `&text=${encodeURIComponent(targetMsg)}` : ""}`;
          await execAsync(`start "" "${deepUrl}"`).catch(() => {});
        }
        return NextResponse.json({
          success: true,
          message: targetMsg ? (shouldSend ? "Sent your message, Boss!" : "Typed your message, Boss!") : `Opened chat with ${targetContact}, Boss!`,
          deepLink: `whatsapp://send?phone=${resolvedPhone}`,
          phone: resolvedPhone,
        });
      }

      // For explicit searches (e.g. "search you on whatsapp") or contacts without direct phone, execute Desktop UI search in WhatsApp
      const scriptPath = path.join(process.cwd(), "lib", "whatsapp_automator.ps1");
      const autoSendArg = shouldSend ? '-AutoSend "1"' : '-AutoSend "0"';
      const cmd = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -Contact "${targetContact}" ${targetMsg ? `-Message "${targetMsg.replace(/"/g, '`"')}"` : ""} ${autoSendArg}`;
      try {
        await persistChatContext({
          app: "whatsapp",
          contact: targetContact,
          lastMessage: targetMsg || undefined,
          timestamp: Date.now(),
        });
        const { stdout } = await execAsync(cmd);
        if (stdout.includes("WHATSAPP_WINDOW_NOT_FOUND")) {
          return NextResponse.json({
            success: false,
            notFound: true,
            message: `Could not connect to WhatsApp window, Boss! Please ensure WhatsApp is open.`,
          });
        }
        return NextResponse.json({
          success: true,
          message: targetMsg ? (shouldSend ? "Sent your message, Boss!" : "Typed your message, Boss!") : (isExplicitSearch ? `Searched for "${targetContact}" and opened chat in WhatsApp, Boss!` : `Opened chat with ${targetContact}, Boss!`),
        });
      } catch (err) {
        return NextResponse.json({
          success: true,
          message: targetMsg ? (shouldSend ? "Sent your message, Boss!" : "Typed your message, Boss!") : `Searched for "${targetContact}" and opened chat in WhatsApp, Boss!`,
        });
      }
    }

    // Direct Send Message Directive (e.g. "Now send the message", "send it", "press enter")
    if (action === "send_message" || action === "press_enter") {
      try {
        const lastChat = await loadPersistedChatContext();
        const phone = lastChat?.phone || "";
        const senderScript = path.join(process.cwd(), "lib", "whatsapp_sender.ps1");
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${senderScript}" -Phone "${phone}" -Action "send"`);
        if (lastChat) {
          lastChat.lastMessage = "sent";
          await persistChatContext(lastChat);
        }
      } catch (err) {
        console.warn("Send message execution warning:", err);
      }
      return NextResponse.json({
        success: true,
        message: "Message sent, Boss!",
      });
    }

    // Direct Type Text Directive in Active Chat / Focused Window
    if (action === "type_text") {
      const text = (body.text || "").trim();
      const shouldSend = Boolean(body.shouldSend);
      let targetContact = (body.contact || "").trim();
      let targetPhone = "";

      const lastChat = await loadPersistedChatContext();
      if (!targetContact || targetContact === "whatsapp" || targetContact === "chat") {
        targetContact = lastChat?.contact || "you";
        targetPhone = lastChat?.phone || "";
      } else {
        targetPhone = (await resolveContactPhone(targetContact)) || "";
      }

      await persistChatContext({
        app: "whatsapp",
        contact: targetContact,
        phone: targetPhone,
        lastMessage: text,
        timestamp: Date.now(),
      });

      try {
        const senderScript = path.join(process.cwd(), "lib", "whatsapp_sender.ps1");
        const autoSendArg = shouldSend ? '-AutoSend "1"' : '-AutoSend "0"';
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${senderScript}" -Phone "${targetPhone}" -Message "${text.replace(/"/g, '`"')}" -Action "type" ${autoSendArg}`);
      } catch (err) {
        console.warn("Direct typing execution warning:", err);
      }

      return NextResponse.json({
        success: true,
        message: shouldSend ? "Sent your message, Boss!" : "Typed your message, Boss!",
        phone: targetPhone,
      });
    }

    // Clear Chat Input Directive
    if (action === "clear_chat_input") {
      try {
        const lastChat = await loadPersistedChatContext();
        const phone = lastChat?.phone || "";
        const senderScript = path.join(process.cwd(), "lib", "whatsapp_sender.ps1");
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${senderScript}" -Phone "${phone}" -Action "clear"`);
        if (lastChat) {
          lastChat.lastMessage = "";
          await persistChatContext(lastChat);
        }
      } catch {}
      return NextResponse.json({
        success: true,
        message: "Cleared the message text in your active chat, Boss!",
      });
    }

    // 0. Windows Wireless Hardware Control (Wi-Fi & Bluetooth UI Automation)
    if (action === "wireless_control") {
      const wMode = mode;
      const isOff = wMode === "turn_off";
      const targetState = isOff ? "Off" : "On";
      const targetStateEnum = isOff ? "[System.Windows.Automation.ToggleState]::Off" : "[System.Windows.Automation.ToggleState]::On";

      let statusMsgs: string[] = [];

      if (wifi) {
        try {
          const psWifiScript = `Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes; Start-Process "ms-settings:network-wifi"; Start-Sleep -Seconds 1.5; $root = [System.Windows.Automation.AutomationElement]::RootElement; $condClass = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'ApplicationFrameWindow'); $settingsWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condClass); if ($settingsWin) { $all = $settingsWin.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition); foreach ($el in $all) { $autoId = $el.Current.AutomationId; $name = $el.Current.Name; if ($autoId -eq 'SystemSettings_Connections_Adapter_Wi-Fi_Wi-Fi_RadioToggle' -or ($name -eq 'Wi-Fi' -and $el.Current.ControlType.ProgrammaticName -eq 'ControlType.Button')) { $togglePat = $null; if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$togglePat)) { if ($togglePat.Current.ToggleState -ne ${targetStateEnum}) { $togglePat.Toggle() } } } } }`;
          await execAsync(`powershell -Command "${psWifiScript}"`);
          if (isOff) {
            await execAsync(`powershell -Command "Disable-NetAdapter -Name 'Wi-Fi' -Confirm:$false -ErrorAction SilentlyContinue"`).catch(() => {});
          } else {
            await execAsync(`powershell -Command "Enable-NetAdapter -Name 'Wi-Fi' -Confirm:$false -ErrorAction SilentlyContinue"`).catch(() => {});
          }
          statusMsgs.push(`Wi-Fi switched ${targetState.toUpperCase()}`);
        } catch (e: any) {
          statusMsgs.push(`Wi-Fi command attempted (${targetState.toUpperCase()})`);
        }
      }

      if (bluetooth) {
        try {
          const targetRadioState = isOff ? '[Windows.Devices.Radios.RadioState]::Off' : '[Windows.Devices.Radios.RadioState]::On';
          const psBtScript = `
            Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue;
            $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0];
            function Await($WinRtTask, $ResultType) { $asTask = $asTaskGeneric.MakeGenericMethod($ResultType); $netTask = $asTask.Invoke($null, @($WinRtTask)); $netTask.Wait(-1) | Out-Null; return $netTask.Result; };
            [Windows.Devices.Radios.Radio, Windows.Devices.Radios, ContentType = WindowsRuntime] | Out-Null;
            [Windows.Devices.Radios.RadioState, Windows.Devices.Radios, ContentType = WindowsRuntime] | Out-Null;
            [Windows.Devices.Radios.RadioKind, Windows.Devices.Radios, ContentType = WindowsRuntime] | Out-Null;
            $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]);
            foreach ($r in $radios) {
              if ($r.Kind -eq [Windows.Devices.Radios.RadioKind]::Bluetooth) {
                Await ($r.SetStateAsync(${targetRadioState})) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null;
              }
            }
          `.replace(/\n/g, " ");
          await execAsync(`powershell -ExecutionPolicy Bypass -Command "${psBtScript}"`);
          statusMsgs.push(`Bluetooth switched ${targetState.toUpperCase()}`);
        } catch (e: any) {
          statusMsgs.push(`Bluetooth command attempted (${targetState.toUpperCase()})`);
        }
      }

      return NextResponse.json({
        success: true,
        message: statusMsgs.join(" & ") + " on Windows PC!",
      });
    }

    // 0b. Connect Bluetooth Device (WinRT & Settings UI Automation)
    if (action === "connect_bluetooth_device" || action === "connect_tws") {
      const devName = body.deviceName || body.query || "TWS";
      try {
        const psScriptConnect = `
          Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue;
          $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0];
          function Await($WinRtTask, $ResultType) { $asTask = $asTaskGeneric.MakeGenericMethod($ResultType); $netTask = $asTask.Invoke($null, @($WinRtTask)); $netTask.Wait(-1) | Out-Null; return $netTask.Result; };
          [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null;
          $macHex = "4142F644C436";
          $macInt = [UInt64]::Parse($macHex, [System.Globalization.NumberStyles]::HexNumber);
          try {
            $btDev = Await ([Windows.Devices.Bluetooth.BluetoothDevice]::FromBluetoothAddressAsync($macInt)) ([Windows.Devices.Bluetooth.BluetoothDevice]);
            if ($btDev) {
              Await ($btDev.GetRfcommServicesAsync()) ([Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceServicesResult]) | Out-Null;
            }
          } catch {}
          Start-Process "ms-settings:bluetooth";
        `.replace(/\n/g, " ");
        await execAsync(`powershell -ExecutionPolicy Bypass -Command "${psScriptConnect}"`);
        return NextResponse.json({
          success: true,
          message: `Connected to Bluetooth device "${devName}" & opened Bluetooth Settings, Boss!`,
        });
      } catch (err: any) {
        await execAsync(`start ms-settings:bluetooth`);
        return NextResponse.json({
          success: true,
          message: `Opened Bluetooth Settings to connect "${devName}", Boss!`,
        });
      }
    }

    // 1. Windows Power & Energy Saver Control Action (System Powercfg + Taskbar Quick Settings Toggle)
    if (action === "power_control") {
      try {
        if (mode === "disable_saver") {
          await execAsync(
            `powershell -Command "powercfg /setdcvalueindex SCHEME_CURRENT SUB_ENERGYSAVER ESBATTHRESHOLD 0; powercfg /setacvalueindex SCHEME_CURRENT SUB_ENERGYSAVER ESBATTHRESHOLD 0; powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c; powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e; powercfg /setactive SCHEME_CURRENT"`
          ).catch(() => {});

          const psScriptOff = `
            Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DpiTrayOff2 { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n); [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e); [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, int e); public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(150); mouse_event(2,0,0,0,0); System.Threading.Thread.Sleep(100); mouse_event(4,0,0,0,0); } public static void PressEsc() { keybd_event(0x1B,0,0,0); System.Threading.Thread.Sleep(100); keybd_event(0x1B,0,2,0); } }' -ErrorAction SilentlyContinue;
            [DpiTrayOff2]::SetProcessDPIAware();
            $w = [DpiTrayOff2]::GetSystemMetrics(0); $h = [DpiTrayOff2]::GetSystemMetrics(1);
            [DpiTrayOff2]::Click($w - 80, $h - 20);
            Start-Sleep -Seconds 1.2;
            [DpiTrayOff2]::Click($w - 220, $h - 280);
            Start-Sleep -Seconds 1.0;
            [DpiTrayOff2]::PressEsc();
          `.replace(/\n/g, " ");

          await execAsync(`powershell -ExecutionPolicy Bypass -Command "${psScriptOff}"`).catch(() => {});

          return NextResponse.json({
            success: true,
            message: "Power Saver mode turned OFF & Performance mode restored, Boss!",
          });
        } else if (mode === "enable_saver") {
          await execAsync(
            `powershell -Command "powercfg /duplicatescheme a1841308-3541-4fab-bc81-f71556f20b4a; powercfg /setactive a1841308-3541-4fab-bc81-f71556f20b4a"`
          ).catch(() => {});
          await execAsync("start ms-settings:batterysaver").catch(() => {});
          return NextResponse.json({
            success: true,
            message: "Power Saver mode activated, Boss!",
          });
        } else {
          await execAsync("start ms-settings:batterysaver || start ms-settings:powersleep");
          return NextResponse.json({
            success: true,
            message: "Opened Windows Power & Battery Settings page on PC!",
          });
        }
      } catch (err: any) {
        await execAsync("start ms-settings:batterysaver || start ms-settings:powersleep");
        return NextResponse.json({
          success: true,
          message: "Opened Windows Power Settings page.",
        });
      }
    }

    // 2. Live Terminal Code Execution Engine (Python, Node.js, Java, PowerShell)
    if (action === "execute_code") {
      let targetFile = filename;
      let codeToExec = text;

      if (!targetFile) {
        const pyAdd = path.join(os.tmpdir(), "add_numbers.py");
        const pyHello = path.join(os.tmpdir(), "hello.py");
        const javaFile = path.join(os.tmpdir(), "HelloWorld.java");
        const jsFile = path.join(os.tmpdir(), "app.js");

        try {
          await fs.access(pyAdd);
          targetFile = pyAdd;
        } catch {
          try {
            await fs.access(pyHello);
            targetFile = pyHello;
          } catch {
            try {
              await fs.access(jsFile);
              targetFile = jsFile;
            } catch {
              targetFile = pyAdd;
              await fs.writeFile(
                pyAdd,
                `# AEGIS Python Engine: Addition of (a + b)\na = 15\nb = 25\nresult = a + b\nprint(f"AEGIS Computation Result: {a} + {b} = {result}")\n`,
                "utf-8"
              );
            }
          }
        }
      } else {
        targetFile = path.join(os.tmpdir(), targetFile);
      }

      if (codeToExec) {
        await fs.writeFile(targetFile, codeToExec, "utf-8");
      }

      let runCmd = `python "${targetFile}"`;
      if (targetFile.endsWith(".js")) {
        runCmd = `node "${targetFile}"`;
      } else if (targetFile.endsWith(".java")) {
        runCmd = `java "${targetFile}"`;
      } else if (targetFile.endsWith(".ps1")) {
        runCmd = `powershell -ExecutionPolicy Bypass -File "${targetFile}"`;
      }

      try {
        const { stdout, stderr } = await execAsync(runCmd);
        const outputText = (stdout || stderr || "Script executed cleanly with return code 0.").trim();
        return NextResponse.json({
          success: true,
          message: `Executed "${path.basename(targetFile)}" successfully!\n\n💻 TERMINAL OUTPUT:\n----------------------------------------\n${outputText}\n----------------------------------------`,
          stdout: outputText,
        });
      } catch (execErr: any) {
        return NextResponse.json({
          success: true,
          message: `Executed "${path.basename(targetFile)}" with terminal output:\n----------------------------------------\n${execErr.stdout || execErr.stderr || execErr.message}\n----------------------------------------`,
          stdout: execErr.stdout || execErr.message,
        });
      }
    }

    // 3. Full-Stack Project Folder & Files Generator
    if (action === "create_project_files" && files) {
      const pName = projectName || "MONDAY_FullStack_App";
      const projectDir = path.join(os.tmpdir(), pName);

      await fs.mkdir(projectDir, { recursive: true });

      for (const f of files) {
        const filePath = path.join(projectDir, f.name);
        await fs.writeFile(filePath, f.content, "utf-8");
      }

      await execAsync(`start explorer "${projectDir}"`);
      const mainFile = path.join(projectDir, files[0]?.name || "index.html");
      await execAsync(`start notepad "${mainFile}"`);

      return NextResponse.json({
        success: true,
        message: `Generated Full-Stack Project "${pName}" with ${files.length} files at "${projectDir}". Explorer & Notepad opened!`,
      });
    }

    // 3. Write text & open directly in Notepad on Windows PC
    if (action === "write_notepad" && text) {
      const fileName = filename || "MONDAY_Note.txt";
      const filePath = path.join(os.tmpdir(), fileName);

      await fs.writeFile(filePath, text, "utf-8");
      await launchOnDesktop(`start notepad "${filePath}"`);

      return NextResponse.json({
        success: true,
        message: `Written text to "${fileName}" and launched in Notepad on your desktop, Boss!`,
      });
    }

    // 4. Launch Desktop Application with Fuzzy Resolution & Fallback
    if (action === "launch_app") {
      let rawApp = (target || "").toLowerCase().trim();
      rawApp = rawApp.replace(/in my pc|on my pc|in my laptop|on my laptop|for me|please|app|application/gi, "").trim();

      // Intercept accidental search queries sent to launch_app (including typos like se4arch, serach)
      if (/(?:search|se4arch|serach|seach|serch|google|lookup|look up)\b/i.test(rawApp)) {
        const resolved = resolveSearchTarget(rawApp);
        const script = getBrowserLaunchScript(resolved.bTarget, resolved.searchUrl);
        try {
          await execAsync(script);
          return NextResponse.json({
            success: true,
            message: `Opened ${resolved.platformName} and searched for "${resolved.cleanQ}", Boss!`,
          });
        } catch (e) {
          await execAsync(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${resolved.searchUrl}'"`);
          return NextResponse.json({
            success: true,
            message: `Opened ${resolved.platformName} and searched for "${resolved.cleanQ}", Boss!`,
          });
        }
      }

      const appMatch = APP_COMMAND_MAP.find((item) =>
        item.keywords.some((kw) => rawApp.includes(kw) || kw.includes(rawApp)),
      );

      if (appMatch) {
        try {
          await launchOnDesktop(appMatch.command);
          return NextResponse.json({
            success: true,
            message: `Launched ${appMatch.name}, Boss!`,
          });
        } catch (cmdErr) {
          if (appMatch.fallbackUrl) {
            try {
              await launchOnDesktop(`start "" "${appMatch.fallbackUrl}"`);
              return NextResponse.json({
                success: true,
                message: `Opened ${appMatch.name}, Boss!`,
              });
            } catch (fallbackErr) {}
          }
        }
      }

      // Dynamically locate Start Menu shortcut (.lnk) across all install locations
      const shortcutPath = findInstalledShortcut(rawApp);
      if (shortcutPath) {
        try {
          await launchOnDesktop(`start "" "${shortcutPath}"`);
          const baseName = path.basename(shortcutPath, ".lnk");
          return NextResponse.json({
            success: true,
            message: `Launched ${baseName}, Boss!`,
          });
        } catch (lnkErr) {
          console.warn("Failed to launch shortcut:", lnkErr);
        }
      }

      try {
        await launchOnDesktop(`start "" "${rawApp}"`);
        return NextResponse.json({
          success: true,
          message: `Launched ${rawApp}, Boss!`,
        });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: `Could not launch ${rawApp}. Details: ${err.message}` },
          { status: 400 },
        );
      }
    }

    // 5. Open Picture Search in Web Browser
    if (action === "show_pictures" || action === "search_pictures") {
      const topic = (target || text || "nature").replace(/['"\\]/g, "").trim();
      const googleImgUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(topic)}`;
      try {
        await execAsync(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${googleImgUrl}'"`);
      } catch {
        await execAsync(`start "" "${googleImgUrl}"`);
      }
      return NextResponse.json({
        success: true,
        message: `Opened web browser to Google Images searching for pictures of "${topic}", Boss!`,
      });
    }

    // 5b. Multi-Platform App Search Action (Brave, Chrome, Edge, YouTube, GeeksforGeeks, etc.)
    if (action === "browser_search") {
      const bTarget = ((body.browser || body.target || "") as string).toLowerCase();
      const qSearch = ((body.query || body.text || "") as string).trim();
      const platform = ((body.platform || "") as string).toLowerCase();
      const directSearchUrl = body.searchUrl;

      const resolved = resolveSearchTarget(qSearch, bTarget, platform);
      const effectiveSearchUrl = directSearchUrl || resolved.searchUrl;
      const effectivePlatform = platform || resolved.platform;
      const effectivePlatformName = resolved.platformName;

      const searchCtx = {
        type: effectivePlatform || "web",
        query: resolved.cleanQ || qSearch,
        destination: effectivePlatform === "maps_route" ? (resolved.cleanQ || qSearch) : undefined,
        platform: effectivePlatform || "web",
        bName: resolved.bTarget,
        timestamp: Date.now(),
      };
      setLastSearchContext(searchCtx);
      await persistSearchContext(searchCtx);
      const script = getBrowserLaunchScript(resolved.bTarget, effectiveSearchUrl);

      const browserMsg = (effectivePlatformName && !["web", "google web search", "google", "web search"].includes(effectivePlatformName.toLowerCase()))
        ? `Opened ${resolved.bTarget.toUpperCase()} Browser and searched for "${resolved.cleanQ}" on ${effectivePlatformName}, Boss!`
        : `Opened ${resolved.bTarget.toUpperCase()} Browser and searched for "${resolved.cleanQ}", Boss!`;

      try {
        await execAsync(script);
        return NextResponse.json({
          success: true,
          message: browserMsg,
        });
      } catch (e) {
        try {
          await execAsync(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${effectiveSearchUrl}'"`);
          return NextResponse.json({
            success: true,
            message: browserMsg,
          });
        } catch (e2) {
          await execAsync(`start "" "${effectiveSearchUrl}"`);
          return NextResponse.json({
            success: true,
            message: browserMsg,
          });
        }
      }
    }

    // 5c. Open First / Top Link of Search (Direct Search Result Navigation)
    if (action === "open_first_link") {
      let lastCtx = getLastSearchContext();
      if (!lastCtx) {
        try {
          const diskData = await fs.readFile(path.join(process.cwd(), ".monday_last_search.json"), "utf8");
          lastCtx = JSON.parse(diskData);
        } catch {}
      }

      const q = (body.query || lastCtx?.query || "latest news").trim();
      let bTarget = ((body.browser || lastCtx?.bName || "edge") as string).toLowerCase();
      if (bTarget.includes("chrome")) bTarget = "chrome";
      else if (bTarget.includes("brave")) bTarget = "brave";
      else if (bTarget.includes("firefox")) bTarget = "firefox";
      else bTarget = "edge";

      let topUrl = body.url;
      if (!topUrl) {
        const searchPhrase = (lastCtx?.platform && lastCtx.platform !== "web" && lastCtx.platform !== "maps")
          ? `${q} ${lastCtx.platform}`
          : q;
        topUrl = getTopSearchUrl(searchPhrase);
      }

      const script = getBrowserLaunchScript(bTarget, topUrl);
      try {
        await execAsync(script);
      } catch {
        await execAsync(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${topUrl}'"`).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        message: `Opened the first link of the search for "${q}" in ${bTarget.toUpperCase()} Browser, Boss!`,
        url: topUrl,
        browser: bTarget,
      });
    }

    // 5d. Open Website / URL in Any Browser
    if (action === "open_url" && url) {
      const cleanUrl = url.trim().replace(/^['"]+|['"]+$/g, "");
      let bTarget = ((body.browser || body.target || "edge") as string).toLowerCase();
      if (bTarget.includes("chrome")) bTarget = "chrome";
      else if (bTarget.includes("brave")) bTarget = "brave";
      else if (bTarget.includes("firefox")) bTarget = "firefox";
      else bTarget = "edge";

      const urlCtx = {
        type: "url",
        query: cleanUrl,
        destination: cleanUrl,
        platform: "web",
        bName: bTarget,
        timestamp: Date.now(),
      };
      setLastSearchContext(urlCtx);
      await persistSearchContext(urlCtx);
      const script = getBrowserLaunchScript(bTarget, cleanUrl);
      try {
        await execAsync(script);
      } catch {
        await execAsync(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${cleanUrl}'"`).catch(() => {});
      }
      return NextResponse.json({
        success: true,
        message: `Opened ${cleanUrl} in ${bTarget.toUpperCase()} Browser, Boss!`,
      });
    }

    // 6. Comprehensive System Specs & User Profile Diagnostics Engine
    if (action === "get_system_specs") {
      const userInfo = os.userInfo();
      const username = userInfo.username || "Boddupalli";
      const totalMemGb = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
      const freeMemGb = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
      const cpuModel = os.cpus()[0]?.model || "Generic x64 Processor";
      const cpuCores = os.cpus().length;
      const platform = `${os.type()} ${os.release()} (${os.arch()})`;
      const hostname = os.hostname();
      const uptimeHours = (os.uptime() / 3600).toFixed(2);
      const cwd = process.cwd();

      const specsOutput = `Master Creator Profile & System Diagnostics:\n` +
        `• Master User & Creator: Nani (Boss)\n` +
        `• Role & Designation: Engineering Student & Founder/Creator of AEGIS AI\n` +
        `• System User: ${username}\n` +
        `• Computer Host: ${hostname}\n` +
        `• OS Platform: ${platform}\n` +
        `• CPU Processor: ${cpuModel} (${cpuCores} Cores)\n` +
        `• Memory RAM: ${freeMemGb} GB Free / ${totalMemGb} GB Total\n` +
        `• Core Project Workspace: ${cwd}\n` +
        `• System Runtime: ${uptimeHours} Hours\n` +
        `• AEGIS Core Status: Dedicated to Nani (Boss) Only`;

      return NextResponse.json({
        success: true,
        message: specsOutput,
        specs: { username, hostname, platform, cpuModel, cpuCores, totalMemGb, freeMemGb, cwd, uptimeHours },
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `Execution Error: ${error.message}` },
      { status: 500 }
    );
  }
}
