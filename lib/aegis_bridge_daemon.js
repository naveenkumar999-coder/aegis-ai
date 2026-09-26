// AEGIS PC Command Bridge Daemon
// Listens for cross-device directives from Mobile via Vercel Cloud and Localhost

const { exec, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const CLOUD_URL = "https://aegis-ai-git-main-naveenkumar999-coders-projects.vercel.app";
const LOCAL_URL = "http://localhost:3000";
const LAUNCHER_EXE = path.join(__dirname, "launch_app.exe");

const KNOWN_PORTALS = {
  youtube: { homeUrl: "https://www.youtube.com" },
  google: { homeUrl: "https://www.google.com" },
  github: { homeUrl: "https://github.com" },
  geeksforgeeks: { homeUrl: "https://www.geeksforgeeks.org" },
  w3schools: { homeUrl: "https://www.w3schools.com" },
  leetcode: { homeUrl: "https://leetcode.com" },
  stackoverflow: { homeUrl: "https://stackoverflow.com" },
  wikipedia: { homeUrl: "https://en.wikipedia.org" },
  amazon: { homeUrl: "https://www.amazon.com" },
  spotify: { homeUrl: "https://open.spotify.com" },
  netflix: { homeUrl: "https://www.netflix.com" },
  reddit: { homeUrl: "https://reddit.com" },
};

async function callSystemCommand(body) {
  try {
    const res = await fetch(`${LOCAL_URL}/api/system-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[AEGIS Daemon] Local system-command result:`, data.message);
      return true;
    }
  } catch (err) {
    // Local server offline
  }
  return false;
}

async function executeCommandOnPc(query) {
  console.log(`[AEGIS Daemon] >>> Received cross-device directive for PC: "${query}"`);

  // 1. Universal PC Engine Dispatch via Localhost /api/system-command
  const handled = await callSystemCommand({ action: "execute_query", query });
  if (handled) {
    console.log(`[AEGIS Daemon] Directive successfully executed by local AEGIS engine.`);
    return;
  }

  // 2. Direct Standalone Hardware & Process Fallback (if local Next.js server offline)
  const cleanQ = query.replace(/\b(in\s+my\s+pc|on\s+my\s+pc|in\s+pc|on\s+pc|in\s+my\s+laptop|on\s+my\s+laptop|in\s+laptop|on\s+laptop|in\s+computer|on\s+computer|for\s+me|please)\b/gi, "").trim();
  const qLower = cleanQ.toLowerCase();

  // Detect target browser (defaults to Brave)
  let targetBrowser = "brave";
  if (/\bbrave\b/i.test(qLower)) targetBrowser = "brave";
  else if (/\bchrome\b/i.test(qLower)) targetBrowser = "chrome";
  else if (/\bfirefox\b/i.test(qLower)) targetBrowser = "firefox";
  else if (/\bedge\b/i.test(qLower)) targetBrowser = "edge";

  // Check Close Intent
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
    else if (qLower.includes("edge")) appName = "msedge";
    else if (qLower.includes("firefox")) appName = "firefox";

    const processMap = {
      whatsapp: ["WhatsApp", "WhatsApp.Root"],
      notepad: ["notepad", "Notepad"],
      notpad: ["notepad", "Notepad"],
      calculator: ["calc", "CalculatorApp"],
      calc: ["calc", "CalculatorApp"],
      chrome: ["chrome"],
      brave: ["brave"],
      msedge: ["msedge"],
      edge: ["msedge"],
      firefox: ["firefox"],
      spotify: ["spotify"],
    };
    const toKill = processMap[appName] || [appName];
    for (const p of toKill) {
      try {
        exec(`powershell -Command "Stop-Process -Name '${p}' -Force -ErrorAction SilentlyContinue"`);
        exec(`taskkill /F /IM ${p}.exe`);
      } catch (e) {}
    }
    return;
  }

  // Audio & Master Volume Controls
  if (/\b(volume\s+up|increase\s+volume|turn\s+up\s+volume|louder)\b/i.test(qLower)) {
    exec(`powershell -Command "for(\$i=0;\$i -lt 5;\$i++){ (New-Object -ComObject WScript.Shell).SendKeys([char]175) }"`);
    return;
  }
  if (/\b(volume\s+down|decrease\s+volume|turn\s+down\s+volume|quieter)\b/i.test(qLower)) {
    exec(`powershell -Command "for(\$i=0;\$i -lt 5;\$i++){ (New-Object -ComObject WScript.Shell).SendKeys([char]174) }"`);
    return;
  }
  if (/\b(mute|unmute|silence|turn\s+off\s+sound|turn\s+on\s+sound)\b/i.test(qLower)) {
    exec(`powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`);
    return;
  }

  // Workstation Controls
  if (/\b(lock\s+pc|lock\s+laptop|lock\s+workstation|lock\s+computer|lock\s+screen)\b/i.test(qLower)) {
    exec(`rundll32.exe user32.dll,LockWorkStation`);
    return;
  }
  if (/\b(sleep|sleep\s+pc|sleep\s+laptop)\b/i.test(qLower)) {
    exec(`rundll32.exe powrprof.dll,SetSuspendState 0,1,0`);
    return;
  }

  // Universal Web Portal / Link / Search Handler
  let matchedPortal = null;
  for (const [key, portal] of Object.entries(KNOWN_PORTALS)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(qLower)) {
      matchedPortal = { id: key, ...portal };
      break;
    }
  }

  const isSearch = /^(?:now\s+|please\s+)?(?:search|find|lookup|look\s+up)\b/i.test(qLower) || /\b(?:search|lookup|look\s+up)\b/i.test(qLower);
  const isOpen = /^(?:now\s+|please\s+)?(?:open|launch|start|go\s+to|goto|visit)\b/i.test(qLower);

  // If search query (e.g. "search python in brave")
  if (isSearch) {
    let term = qLower
      .replace(/^(?:now\s+|please\s+)?(?:search|find|lookup|look\s+up)\s+/i, "")
      .replace(/\b(in\s+brave|on\s+brave|in\s+chrome|on\s+chrome|in\s+edge|on\s+edge|in\s+firefox|on\s+firefox|in\s+browser|on\s+browser)\b/gi, "")
      .replace(/\b(for|about|on|in)\b/gi, "")
      .trim();

    if (matchedPortal && matchedPortal.id === "youtube" && (term === "youtube" || !term)) {
      exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${targetBrowser}' 'https://www.youtube.com' -ErrorAction SilentlyContinue; if (\$LASTEXITCODE -ne 0) { Start-Process 'https://www.youtube.com' }"`);
      return;
    }

    const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(term || query)}`;
    exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${targetBrowser}' '${fallbackUrl}' -ErrorAction SilentlyContinue; if (\$LASTEXITCODE -ne 0) { Start-Process '${fallbackUrl}' }"`);
    return;
  }

  // Check explicit full URL
  const rawUrlMatch = query.match(/https?:\/\/[^\s]+/i);
  if (rawUrlMatch) {
    exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${targetBrowser}' '${rawUrlMatch[0]}' -ErrorAction SilentlyContinue; if (\$LASTEXITCODE -ne 0) { Start-Process '${rawUrlMatch[0]}' }"`);
    return;
  }

  // Check explicit domain / URL match (e.g. files.com, cricbuzz.com, youtube.com)
  const domainMatch = qLower.match(/\b([a-zA-Z0-9-]+\.(?:com|org|net|io|edu|gov|co|in|ai|dev|app|tv|xyz)(?:\/[^\s]*)?)\b/i);
  if (domainMatch) {
    const targetUrl = domainMatch[1].startsWith("http") ? domainMatch[1] : `https://${domainMatch[1]}`;
    exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${targetBrowser}' '${targetUrl}' -ErrorAction SilentlyContinue; if (\$LASTEXITCODE -ne 0) { Start-Process '${targetUrl}' }"`);
    return;
  }

  // If opening portal or any website name (e.g. "open cricbuzz in brave", "open reddit in brave", "open hotstar in brave")
  if (isOpen || qLower.includes("in brave") || qLower.includes("in chrome") || qLower.includes("in edge")) {
    let siteCand = qLower
      .replace(/^(?:now\s+|please\s+)?(?:open|launch|start|go\s+to|goto|visit)\s+/i, "")
      .replace(/\b(in\s+brave|on\s+brave|in\s+chrome|on\s+chrome|in\s+edge|on\s+edge|in\s+firefox|on\s+firefox|in\s+browser|on\s+browser)\b/gi, "")
      .replace(/\b(website|webpage|portal|site|page|link|app|application)\b/gi, "")
      .trim();

    if (matchedPortal) {
      exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${targetBrowser}' '${matchedPortal.homeUrl}' -ErrorAction SilentlyContinue; if (\$LASTEXITCODE -ne 0) { Start-Process '${matchedPortal.homeUrl}' }"`);
      return;
    }

    const cleanSite = siteCand.replace(/[^a-z0-9-]/gi, "");
    if (cleanSite.length > 0 && cleanSite !== "brave" && cleanSite !== "chrome" && cleanSite !== "edge" && cleanSite !== "browser") {
      const targetUrl = `https://www.${cleanSite}.com`;
      exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${targetBrowser}' '${targetUrl}' -ErrorAction SilentlyContinue; if (\$LASTEXITCODE -ne 0) { Start-Process '${targetUrl}' }"`);
      return;
    }

    if (cleanSite === "brave" || cleanSite === "chrome" || cleanSite === "edge" || cleanSite === "browser" || !cleanSite) {
      exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${targetBrowser}'"`);
      return;
    }
  }

  // 5. Default: Launch desktop app
  let appToLaunch = qLower
    .replace(/^(?:now\s+|please\s+)?(?:open|launch|start|run)\s+(?:the\s+)?/i, "")
    .replace(/\b(app|application)\b/gi, "")
    .trim();

  let targetCmd = appToLaunch;
  if (appToLaunch.includes("whatsapp")) targetCmd = "start whatsapp:";
  else if (appToLaunch.includes("notepad")) targetCmd = "start notepad";
  else if (appToLaunch.includes("calc")) targetCmd = "start calc";
  else targetCmd = `start "" "${appToLaunch}"`;

  if (fs.existsSync(LAUNCHER_EXE)) {
    const child = spawn(LAUNCHER_EXE, [targetCmd], { detached: true, stdio: "ignore" });
    child.unref();
  } else {
    exec(`cmd.exe /c ${targetCmd}`);
  }
}

async function pollBridge(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/command-bridge?device=pc`);
    if (res.ok) {
      const data = await res.json();
      if (data.commands && data.commands.length > 0) {
        for (const cmd of data.commands) {
          await executeCommandOnPc(cmd.query);
        }
      }
    }
  } catch (err) {
    // Silent catch for network hiccups
  }
}

console.log("[AEGIS Daemon] PC Cross-Device Command Bridge Listener ACTIVE");
console.log(`[AEGIS Daemon] Polling Cloud: ${CLOUD_URL}`);
console.log(`[AEGIS Daemon] Polling Local: ${LOCAL_URL}`);

// Poll every 1000ms
setInterval(() => {
  pollBridge(CLOUD_URL);
  pollBridge(LOCAL_URL);
}, 1000);
