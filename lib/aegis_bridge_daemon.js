// AEGIS PC Command Bridge Daemon
// Listens for cross-device directives from Mobile via Vercel Cloud and Localhost

const { exec, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const CLOUD_URL = "https://aegis-ai-git-main-naveenkumar999-coders-projects.vercel.app";
const LOCAL_URL = "http://localhost:3000";
const LAUNCHER_EXE = path.join(__dirname, "launch_app.exe");

async function executeCommandOnPc(query) {
  console.log(`[AEGIS Daemon] >>> Received cross-device directive for PC: "${query}"`);
  
  const isClose = /\b(close|kill|quit|exit|terminate|shut\s*down|shutdown|dismiss|end|stop|clear)\b/i.test(query);

  let appName = query.toLowerCase().trim()
    .replace(/^(?:now\s+|please\s+)?(?:open|launch|start|run|close|kill|quit|exit|terminate|shut\s*down|shutdown|dismiss|end|stop|clear)\s+(?:the\s+)?/i, "")
    .replace(/\b(in\s+my\s+pc|on\s+my\s+pc|in\s+pc|on\s+pc|in\s+my\s+laptop|on\s+my\s+laptop|in\s+laptop|on\s+laptop|in\s+computer|on\s+computer|for\s+me|please|app|application|window)\b/gi, "")
    .trim();

  if (query.toLowerCase().includes("whatsapp")) appName = "whatsapp";
  else if (query.toLowerCase().includes("notepad") || query.toLowerCase().includes("notpad")) appName = "notepad";
  else if (query.toLowerCase().includes("calc")) appName = "calculator";
  else if (query.toLowerCase().includes("chrome")) appName = "chrome";
  else if (query.toLowerCase().includes("brave")) appName = "brave";
  else if (query.toLowerCase().includes("edge")) appName = "edge";
  else if (query.toLowerCase().includes("all")) appName = "all";

  const action = isClose ? "close_app" : "launch_app";

  // 1. Try local Next.js system-command endpoint
  try {
    const res = await fetch(`${LOCAL_URL}/api/system-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, target: appName || query }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[AEGIS Daemon] Local system-command result (${action}):`, data.message);
      return;
    }
  } catch (err) {
    // Local server offline, fallback to native Windows execution
  }

  // 2. Direct native Windows fallback
  if (isClose) {
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
    console.log(`[AEGIS Daemon] Native closed: ${appName}`);
  } else {
    let targetCmd = appName;
    if (appName === "whatsapp") targetCmd = "start whatsapp:";
    else if (appName === "notepad") targetCmd = "start notepad";
    else if (appName === "calculator") targetCmd = "start calc";
    else if (appName === "chrome") targetCmd = "start chrome";
    else if (appName === "brave") targetCmd = "start brave";
    else if (appName === "edge") targetCmd = "start msedge";
    else targetCmd = `start "" "${appName}"`;

    try {
      if (fs.existsSync(LAUNCHER_EXE)) {
        const child = spawn(LAUNCHER_EXE, [targetCmd], { detached: true, stdio: "ignore" });
        child.unref();
      } else {
        exec(`cmd.exe /c ${targetCmd}`);
      }
      console.log(`[AEGIS Daemon] Native launched: ${targetCmd}`);
    } catch (e) {
      console.error(`[AEGIS Daemon] Execution failed:`, e);
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
