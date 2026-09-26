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
  
  const q = query.toLowerCase().trim()
    .replace(/^(?:now\s+|please\s+)?(?:open|launch|start|run)?\s*/i, "")
    .replace(/\b(in\s+my\s+pc|on\s+my\s+pc|in\s+pc|on\s+pc|in\s+my\s+laptop|on\s+my\s+laptop|in\s+laptop|on\s+laptop|in\s+computer|on\s+computer)\b/gi, "")
    .trim();

  // 1. Try local Next.js system-command endpoint
  try {
    const res = await fetch(`${LOCAL_URL}/api/system-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "launch_app", target: q || query }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[AEGIS Daemon] Local system-command result:`, data.message);
      return;
    }
  } catch (err) {
    // Local server might be offline, fallback to direct native execution
  }

  // 2. Direct native Windows execution fallback
  let targetCmd = q;
  if (q.includes("whatsapp")) targetCmd = "start whatsapp:";
  else if (q.includes("notepad")) targetCmd = "start notepad";
  else if (q.includes("calc")) targetCmd = "start calc";
  else if (q.includes("chrome")) targetCmd = "start chrome";
  else if (q.includes("brave")) targetCmd = "start brave";
  else if (q.includes("edge")) targetCmd = "start msedge";
  else targetCmd = `start "" "${q}"`;

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
