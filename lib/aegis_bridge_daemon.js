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

  const cleanQ = query.replace(/\b(in\s+my\s+pc|on\s+my\s+pc|in\s+pc|on\s+pc|in\s+my\s+laptop|on\s+my\s+laptop|in\s+laptop|on\s+laptop|in\s+computer|on\s+computer)\b/gi, "").trim();
  const qLower = cleanQ.toLowerCase();

  // 1. Detect target browser (brave, chrome, edge, firefox)
  let targetBrowser = "edge";
  if (/\bbrave\b/i.test(qLower)) targetBrowser = "brave";
  else if (/\bchrome\b/i.test(qLower)) targetBrowser = "chrome";
  else if (/\bfirefox\b/i.test(qLower)) targetBrowser = "firefox";

  // 2. Check if this is a CLOSE directive
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
    else if (qLower.includes("all")) appName = "all";

    const handled = await callSystemCommand({ action: "close_app", target: appName });
    if (!handled) {
      const processMap = {
        whatsapp: ["WhatsApp", "WhatsApp.Root"],
        notepad: ["notepad", "Notepad"],
        notpad: ["notepad", "Notepad"],
        calculator: ["calc", "CalculatorApp"],
        calc: ["calc", "CalculatorApp"],
        chrome: ["chrome"],
        brave: ["brave"],
        edge: ["msedge"],
        spotify: ["spotify"],
      };
      const toKill = processMap[appName] || [appName];
      for (const p of toKill) {
        try {
          exec(`powershell -Command "Stop-Process -Name '${p}' -Force -ErrorAction SilentlyContinue"`);
          exec(`taskkill /F /IM ${p}.exe`);
        } catch (e) {}
      }
    }
    return;
  }

  // 3. Check for Known Web Portal / URL / Search
  let matchedPortal = null;
  for (const [key, portal] of Object.entries(KNOWN_PORTALS)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(qLower)) {
      matchedPortal = { id: key, ...portal };
      break;
    }
  }

  const isSearch = /^(?:now\s+|please\s+)?(?:search|find|lookup|look\s+up)\b/i.test(qLower) || /\b(?:search|lookup|look\s+up)\b/i.test(qLower);
  const isOpen = /^(?:now\s+|please\s+)?(?:open|launch|start|go\s+to|goto)\b/i.test(qLower);

  // If opening portal (e.g. "open youtube in brave", "open youtube", "open github")
  if (isOpen && matchedPortal) {
    const handled = await callSystemCommand({ action: "open_url", browser: targetBrowser, url: matchedPortal.homeUrl });
    if (!handled) {
      exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${matchedPortal.homeUrl}'"`);
    }
    return;
  }

  // If search query (e.g. "search youtube in brave", "search python in brave")
  if (isSearch) {
    let term = qLower
      .replace(/^(?:now\s+|please\s+)?(?:search|find|lookup|look\s+up)\s+/i, "")
      .replace(/\b(in\s+brave|on\s+brave|in\s+chrome|on\s+chrome|in\s+edge|on\s+edge|in\s+firefox|on\s+firefox|in\s+browser|on\s+browser)\b/gi, "")
      .replace(/\b(for|about|on|in)\b/gi, "")
      .trim();

    // If query was just "search youtube in brave" -> User wants YouTube!
    if (matchedPortal && matchedPortal.id === "youtube" && (term === "youtube" || !term)) {
      const handled = await callSystemCommand({ action: "open_url", browser: targetBrowser, url: "https://www.youtube.com" });
      if (!handled) exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process 'https://www.youtube.com'"`);
      return;
    }

    const handled = await callSystemCommand({
      action: "browser_search",
      browser: targetBrowser,
      query: term || query,
      platform: matchedPortal ? matchedPortal.id : "web",
    });
    if (!handled) {
      const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(term || query)}`;
      exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${fallbackUrl}'"`);
    }
    return;
  }

  // Check explicit domain / URL match (e.g. files.com, youtube.com)
  const domainMatch = qLower.match(/\b([a-zA-Z0-9-]+\.(?:com|org|net|io|edu|gov|co|in|ai|dev|app)(?:\/[^\s]*)?)\b/i);
  if (domainMatch) {
    const targetUrl = domainMatch[1].startsWith("http") ? domainMatch[1] : `https://${domainMatch[1]}`;
    const handled = await callSystemCommand({ action: "open_url", browser: targetBrowser, url: targetUrl });
    if (!handled) exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process '${targetUrl}'"`);
    return;
  }

  // 4. Default: Launch desktop app
  let appToLaunch = qLower
    .replace(/^(?:now\s+|please\s+)?(?:open|launch|start|run)\s+(?:the\s+)?/i, "")
    .replace(/\b(app|application)\b/gi, "")
    .trim();

  if (qLower.includes("whatsapp")) appToLaunch = "whatsapp";
  else if (qLower.includes("notepad") || qLower.includes("notpad")) appToLaunch = "notepad";
  else if (qLower.includes("calc")) appToLaunch = "calculator";

  const handled = await callSystemCommand({ action: "launch_app", target: appToLaunch || query });
  if (!handled) {
    let targetCmd = appToLaunch;
    if (appToLaunch === "whatsapp") targetCmd = "start whatsapp:";
    else if (appToLaunch === "notepad") targetCmd = "start notepad";
    else if (appToLaunch === "calculator") targetCmd = "start calc";
    else targetCmd = `start "" "${appToLaunch}"`;

    if (fs.existsSync(LAUNCHER_EXE)) {
      const child = spawn(LAUNCHER_EXE, [targetCmd], { detached: true, stdio: "ignore" });
      child.unref();
    } else {
      exec(`cmd.exe /c ${targetCmd}`);
    }
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
