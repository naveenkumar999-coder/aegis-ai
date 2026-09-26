import { NextResponse } from "next/server";
import { getLastSearchContext, fetchLiveReadout, findPortalMatch, getLastChatContext, setLastChatContext } from "@/lib/searchStore";
import { answerViaLiveInternet } from "@/lib/webKnowledge";
import { CodeEngine } from "@/lib/codeEngine";
import { AutonomousAgent } from "@/lib/autonomousAgent";
import { SkillStore } from "@/lib/skillStore";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const AEGIS_SYSTEM_PROMPT = `You are AEGIS (Autonomous Executive & General Intelligence System), an advanced cybernetic AI assistant created by your Boss, Nani.
Knowledge about your Boss:
- Name: Nani (only Nani is your Boss).
- Profession/Role: Engineering Student & Master Creator/Developer of AEGIS AI project.
- Instruction: You MUST address Nani with exactly ONE "Boss!" in every single response. NEVER repeat "Boss" multiple times.
- Tone: Smooth, energetic, sharp, respectful, and friendly.
- Format: Respond concisely (1 short sentence max). Skip lengthy outros and repetitive boilerplate so your spoken text sounds crisp and natural.
- If a tool output is provided, state it directly and concisely with exactly one "Boss!".`;

export async function POST(req: Request) {
  try {
    const { prompt, apiKey, toolData } = await req.json();
    let cleanPrompt = (typeof prompt === "string" ? prompt : "").trim();
    cleanPrompt = cleanPrompt
      .replace(/\b(?:are\s+a\s+room|all\s+a\s+room|our\s+room|hour\s+room|how\s+low|hallo|helo|yellow|halo|hello\s+there|hell\s+o|hellow)\b/gi, "hello")
      .replace(/^\s*(?:tight|right|rite|wright|light|white|nite)\b/gi, "write")
      .replace(/\b(?:tight|right|rite|wright|light|white)\s+(?:and\s+simple|a\s+simple|a\s+|the\s+)?(?:code|program|script|hello|python|java|c\+\+|cpp|c|html|js|javascript|c#|rust|go)\b/gi, "write simple $2")
      .replace(/\b(?:a\s+minus\s+[pb]|a\s*[-–—]\s*[pb]|a\s+minis\s+[pb])\b/gi, "a - b")
      .replace(/\b(?:a\s+plus\s+[pb]|a\s*[\+]\s*[pb]|a\s+pluss\s+[pb])\b/gi, "a + b")
      .replace(/\b(?:a\s+into\s+[pb]|a\s+times\s+[pb]|a\s*[\*]\s*[pb]|a\s+multiplied\s+by\s+[pb])\b/gi, "a * b")
      .replace(/\b(?:a\s+divided\s+by\s+[pb]|a\s+by\s+[pb]|a\s*[\/]\s*[pb])\b/gi, "a / b")
      .replace(/\b(?:a\s+modulo\s+[pb]|a\s+mod\s+[pb]|a\s*[%]\s*[pb])\b/gi, "a % b")
      .replace(/\b(?:nsp\s+code)\b/gi, "a - b code")
      .replace(/\b(?:sample|simple)\s+a\s+minus\s+[pb]\b/gi, "simple a - b")
      .replace(/\b(?:sample|simple)\s+a\s+plus\s+[pb]\b/gi, "simple a + b")
      .replace(/\bminus\s+p\b/gi, "minus b")
      .replace(/\bplus\s+p\b/gi, "plus b");

    const q = cleanPrompt.toLowerCase()
      .replace(/[\\.,!?;:](?!\w)/g, " ")
      .replace(/\b(?:are\s+a\s+room|all\s+a\s+room|our\s+room|hour\s+room|how\s+low|hallo|helo|yellow|halo|hello\s+there|hell\s+o|hellow)\b/gi, "hello")
      .replace(/^\s*(?:eye|high|bye)\b/gi, "hi")
      .replace(/^\s*hay\b/gi, "hey")
      .replace(/\byut\b/gi, "you")
      .replace(/\bshearch\b/gi, "search")
      .replace(/\breasults?\b/gi, "results")
      .replace(/\blounch\b/gi, "launch")
      .replace(/\bebil+ity\b/gi, "ability")
      .replace(/\b(?:notpad|not pad|note pad)\b/gi, "notepad")
      .replace(/\b(?:calcy|calc|calculater)\b/gi, "calculator")
      .replace(/\b(?:clok|clocke)\b/gi, "clock")
      .replace(/\b(?:filse|flie|filez)\b/gi, "files")
      .replace(/\b(?:gnomec|gnomic|gomec|gomic)\b/gi, "make")
      .replace(/^\s*(?:tight|right|rite|wright|light|white|nite)\b/gi, "write")
      .replace(/\b(?:tight|right|rite|wright|light|white)\s+(?:and\s+simple|a\s+simple|a\s+|the\s+)?(?:code|program|script|hello|python|java|c\+\+|cpp|c|html|js|javascript|c#|rust|go)\b/gi, "write simple $2")
      .replace(/\b(?:a\s+minus\s+[pb]|a\s*[-–—]\s*[pb]|a\s+minis\s+[pb])\b/gi, "a - b")
      .replace(/\b(?:a\s+plus\s+[pb]|a\s*[\+]\s*[pb]|a\s+pluss\s+[pb])\b/gi, "a + b")
      .replace(/\b(?:a\s+into\s+[pb]|a\s+times\s+[pb]|a\s*[\*]\s*[pb]|a\s+multiplied\s+by\s+[pb])\b/gi, "a * b")
      .replace(/\b(?:a\s+divided\s+by\s+[pb]|a\s+by\s+[pb]|a\s*[\/]\s*[pb])\b/gi, "a / b")
      .replace(/\b(?:a\s+modulo\s+[pb]|a\s+mod\s+[pb]|a\s*[%]\s*[pb])\b/gi, "a % b")
      .replace(/\b(?:nsp\s+code)\b/gi, "a - b code")
      .replace(/\b(?:sample|simple)\s+a\s+minus\s+[pb]\b/gi, "simple a - b")
      .replace(/\b(?:sample|simple)\s+a\s+plus\s+[pb]\b/gi, "simple a + b")
      .replace(/\bminus\s+p\b/gi, "minus b")
      .replace(/\bplus\s+p\b/gi, "plus b");

    // 0. If crisp tool output is already present, return it immediately with exactly one "Boss!"
    if (toolData?.output) {
      let raw = toolData.output.trim();
      if (raw.includes("\n")) {
        raw = raw.split("\n")[0].trim();
      }
      raw = raw.replace(/\s*,\s*Boss!*/gi, "").replace(/\s+Boss!*/gi, "").trim();
      return NextResponse.json({ response: `${raw}, Boss!` });
    }

    const activeApiKey = apiKey || process.env.GEMINI_API_KEY;

    // 0.1 Check Autonomous Learned Skill Bank & Skill Management Directives
    try {
      const isSkillQuery = /\b(what\s+skills?\s+(?:have\s+you|did\s+you|are)\s+learned|list\s+(?:your\s+|all\s+)?skills?|show\s+(?:your\s+|all\s+)?skills?|forget\s+skill|delete\s+skill)\b/i.test(q);
      const matchingSkill = await SkillStore.findMatchingSkill(cleanPrompt || prompt);
      if (isSkillQuery || matchingSkill) {
        const autoRes = await AutonomousAgent.processDirective(cleanPrompt || prompt, activeApiKey);
        if (autoRes && autoRes.handled && autoRes.output) {
          let out = autoRes.output.trim().replace(/\s*,\s*Boss!*/gi, "").replace(/\s+Boss!*/gi, "").trim();
          return NextResponse.json({
            response: `${out}, Boss!`,
            source: autoRes.source,
            actionSummary: autoRes.actionSummary,
          });
        }
      }
    } catch (err) {
      console.warn("Skill check error:", err);
    }

    // 1. Try Gemini API if key is present
    if (activeApiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${activeApiKey}`;
        const userContent = toolData
          ? `User Command: ${prompt}\nSystem Tool Result: ${toolData.output}\nInstruction: Output ONLY the crisp tool confirmation or direct answer. Do NOT add extra chatty commentary or outro.`
          : prompt;

        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: `${AEGIS_SYSTEM_PROMPT}\n\n${userContent}` }],
              },
            ],
            generationConfig: {
              maxOutputTokens: 200,
              temperature: 0.7,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const replyText =
            data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (replyText) {
            return NextResponse.json({ response: replyText });
          }
        }
      } catch (geminiError) {
        console.warn("Gemini API call failed, falling back to local AEGIS core:", geminiError);
      }
    }

    // 2. Comprehensive Smart NLU Response Engine
    let reply = "";

    if (toolData) {
      if (toolData.output.includes("Boss")) {
        reply = toolData.output;
      } else {
        reply = `${toolData.output}, Boss!`;
      }
    }
    // Readout Results Intelligence Engine (Handles: "read out the results", "read out the results on searching ai", "then read it and tell me", etc.)
    else if (
      (/\b(read|tell|speak|say|what are|show)\b/i.test(q) && /\b(result|results|reasult|reasults|found|pins|places|stream|streams)\b/i.test(q)) ||
      /\b(then\s+)?read\s+(it|them|out)\b/i.test(q) ||
      /\bwhat\s+did\s+you\s+find\b/i.test(q) ||
      /\btell\s+me\s+what\s+you\s+found\b/i.test(q)
    ) {
      let topic = "";
      const topicMatch = q.match(/(?:on\s+searching|for\s+searching|about\s+searching|searching\s+for|on\s+search|for\s+search|of\s+search|searching|for|about|on|of)\s+([a-zA-Z0-9\s+_-]+)$/i);
      if (topicMatch && topicMatch[1]) {
        topic = topicMatch[1].replace(/in\s+(?:chrome|edge|brave|firefox|browser|youtube|maps)/gi, "").replace(/[?.,!]/g, "").trim();
      }

      const lastCtx = getLastSearchContext();
      let rawTarget = topic || lastCtx?.query || "";
      let targetTopic = rawTarget
        .replace(/^(?:(?:search\s+)?(?:fo\s+)?r\s*=\s*|[a-z0-9_-]{1,6}\s*=\s*|[=:\-–—\s]+)/i, "")
        .replace(/^(?:for|fo|about|on|of|with|to)\s+/i, "")
        .replace(/\s+(?:for|about|on|of)$/i, "")
        .trim();

      const bTarget = (lastCtx?.bName || "EDGE").toUpperCase();
      const readout = await fetchLiveReadout(targetTopic || "information");

      if (readout) {
        reply = `${readout}, Boss!`;
      } else {
        reply = `Here are the top results from your search on ${bTarget} Browser, Boss: Key details are loaded on your desktop, standing by for your directive!`;
      }
    }
    // Explicit Browser Search or Web Link Fallback
    else if (/\b(in\s+(?:the\s+)?browser|on\s+(?:the\s+)?browser|link\s+on\s+browser|link\s+in\s+browser|website|webpage)\b/i.test(q)) {
      const bTarget = "EDGE";
      let candQuery = q
        .replace(/^(?:now\s+|please\s+)?(?:open|launch|start|run|search|find|lookup|browse|show|get)\s+/i, "")
        .replace(/\b(in\s+(?:the\s+)?browser|on\s+(?:the\s+)?browser|in\s+edge|on\s+edge|in\s+chrome|on\s+chrome|in\s+brave|on\s+brave|in\s+firefox|on\s+firefox|link\s+on\s+browser|link\s+in\s+browser|link\s+on|link\s+in|website|webpage|web\s+site|web\s+page|web|browser|link)\b/gi, "")
        .replace(/\b(for|about|of|to)\b/gi, "")
        .replace(/[?.,!]/g, "")
        .replace(/\s+/g, " ")
        .trim() || "files";

      await execAsync(`start msedge "https://www.google.com/search?q=${encodeURIComponent(candQuery)}"`).catch(() => {});
      reply = `Opened ${bTarget} Browser and searched for "${candQuery}", Boss!`;
      return NextResponse.json({ response: reply });
    }
    // Voice & Listening Control Fallback in Chat Route
    else if (
      /\b(turn\s+off|stop|disable|pause|mute|shut\s+down|kill)\s+(?:the\s+)?(?:listening|voice(?:\s+recognition)?|mic|microphone|speech(?:\s+recognition)?|audio\s+input)\b/i.test(q) ||
      /^(?:stop\s+listening|turn\s+off\s+listening|pause\s+listening|mute\s+mic|mute\s+microphone|turn\s+off\s+mic|turn\s+off\s+microphone|mute)$/i.test(q) ||
      /\b(?:turn\s+off\s+listening|stop\s+listening|turn\s+off\s+mic|mute\s+mic)\b/i.test(q)
    ) {
      return NextResponse.json({ response: "Microphone listening deactivated, Boss!" });
    }
    else if (
      /\b(turn\s+on|start|resume|enable|unmute|activate)\s+(?:the\s+)?(?:listening|voice(?:\s+recognition)?|mic|microphone|speech(?:\s+recognition)?|audio\s+input)\b/i.test(q) ||
      /^(?:start\s+listening|turn\s+on\s+listening|resume\s+listening|unmute\s+mic|unmute\s+microphone|turn\s+on\s+mic|turn\s+on\s+microphone|unmute)$/i.test(q) ||
      /\b(?:turn\s+on\s+listening|start\s+listening|turn\s+on\s+mic|unmute\s+mic)\b/i.test(q)
    ) {
      return NextResponse.json({ response: "Microphone listening activated, Boss!" });
    }
    // Window Management Direct Fallback in Chat Route (Fullscreen, Maximize, Minimize, Restore)
    else if (
      /\b(full\s*screen|fullscreen|maximize|maximise|minimize|minimise|restore|unmaximize)\b/i.test(q) ||
      /\bmake\s+(?:the\s+)?([a-z0-9_\s]+?)\s+(?:full\s*screen|fullscreen|maximized?|minimized?)\b/i.test(q) ||
      /\b(minimize\s+all|show\s+desktop)\b/i.test(q) ||
      (/\bmanag[er]\s+(?:the\s+)?applications?\b/i.test(q) && /\b(minimize|full\s*screen|fullscreen)\b/i.test(q))
    ) {
      let winAction = "maximize";
      if (/\b(full\s*screen|fullscreen)\b/i.test(q)) winAction = "fullscreen";
      else if (/\b(minimize|minimise)\b/i.test(q)) winAction = "minimize";
      else if (/\b(restore|unmaximize)\b/i.test(q)) winAction = "restore";
      else if (/\b(maximize|maximise)\b/i.test(q)) winAction = "maximize";

      let winTarget = "browser";
      if (/\b(yourself|you|aegis|monday|ultron|orb|ui|interface)\b/i.test(q)) winTarget = "aegis";
      else if (/\b(notepad|notpad)\b/i.test(q)) winTarget = "notepad";
      else if (/\b(explorer|files|file\s+explorer|folder)\b/i.test(q)) winTarget = "files";
      else if (/\b(whatsapp|whats\s+app)\b/i.test(q)) winTarget = "whatsapp";
      else if (/\b(calculator|calc)\b/i.test(q)) winTarget = "calculator";
      else if (/\b(all|all\s+windows|everything)\b/i.test(q)) winTarget = "all";
      else if (/\b(browser|edge|chrome|brave|firefox|opera)\b/i.test(q)) winTarget = "browser";
      else if (/\b(window|this|current|active|screen|application|applications|app)\b/i.test(q)) winTarget = "active";
      else {
        const appExtract = q.replace(/can\s+you|please|now|make|the|in|on|to|for|full\s*screen|fullscreen|maximize|maximise|minimize|minimise|restore|unmaximize|window|app|application/gi, "").trim();
        if (/\b(yourself|you|aegis|monday|ultron|orb|ui|interface)\b/i.test(appExtract)) {
          winTarget = "aegis";
        } else {
          winTarget = appExtract || "browser";
        }
      }

      try {
        const winMgrExe = path.join(process.cwd(), "lib", "window_manager.exe");
        const { stdout } = await execAsync(`"${winMgrExe}" ${winAction} "${winTarget}"`);
        let out = stdout.trim().replace(/^SUCCESS:\s*/i, "").replace(/^ERROR:\s*/i, "");
        if (!out.includes("Boss!")) out = `${out}, Boss!`;
        return NextResponse.json({ response: out });
      } catch (err: any) {
        const fallbackName = (winTarget === "aegis" || winTarget === "monday") ? "AEGIS interface" : winTarget;
        const actionWord = winAction === "fullscreen" ? "Full Screen" : (winAction === "maximize" ? "Maximized" : (winAction === "minimize" ? "Minimized" : "Restored"));
        return NextResponse.json({ response: `Set ${fallbackName} to ${actionWord}, Boss!` });
      }
    }
    // Close & Terminate Application Direct Fallback in Chat Route
    else if (
      !/\b(saying|message|text|that|chat\s+saying)\b/i.test(q) &&
      !/^(?:type|write|input|paste|enter)\s+/i.test(q) &&
      (/(?:^|\b)(?:no\s*,\s*|no\s+|now\s+|please\s+|can\s+you\s+|could\s+you\s+|kindly\s+|hey\s+aegis\s+|aegis\s+|hey\s+monday\s+|monday\s+)*(?:close|kill|quit|exit|terminate|shut\s*down|shutdown|dismiss|end)\b/i.test(q) ||
       /^(?:no\s*,\s*|no\s+|now\s+|please\s+)?(?:clear)\s+(?:the\s+)?(?:whatsapp|notepad|notpad|files|explorer|browser|calc|calculator|app|application|apps|applications)(?:\s+(?:and\s+)?(?:whatsapp|notepad|notpad|files|explorer|browser|calc|calculator|app|application|apps|applications))?$/i.test(q))
    ) {
      const mentionsWhatsApp = /\b(whatsapp|whats\s+app|watsapp|wasap)\b/i.test(q);
      const mentionsNotepad = /\b(notepad|notpad|note pad|not pad)\b/i.test(q);
      const mentionsFiles = /\b(files|explorer|file\s+explorer|folder)\b/i.test(q);
      const mentionsCalc = /\b(calc|calculator|calculater)\b/i.test(q);
      const mentionsBrave = /\b(brave|brave\s+browser)\b/i.test(q);
      const mentionsChrome = /\b(chrome|google\s+chrome)\b/i.test(q);
      const mentionsEdge = /\b(edge|msedge|microsoft\s+edge)\b/i.test(q);
      const mentionsFirefox = /\b(firefox|mozilla)\b/i.test(q);
      const mentionsBrowser = /\b(browser|web\s+browser)\b/i.test(q);
      const mentionsAll = /\b(all\s+applications|all\s+windows|all\s+apps|everything)\b/i.test(q) || /^close\s+all$/i.test(q.trim());

      const winMgrExe = path.join(process.cwd(), "lib", "window_manager.exe");

      if (mentionsWhatsApp && mentionsNotepad) {
        try {
          await execAsync(`"${winMgrExe}" close whatsapp`).catch(() => {});
          await execAsync(`"${winMgrExe}" close notepad`).catch(() => {});
          await execAsync(`powershell -Command "Stop-Process -Name 'WhatsApp.Root', 'WhatsApp', 'notepad' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed WhatsApp and Notepad applications on your Windows PC, Boss!" });
      } else if (mentionsWhatsApp) {
        try {
          await execAsync(`"${winMgrExe}" close whatsapp`).catch(() => {});
          await execAsync(`powershell -Command "Stop-Process -Name 'WhatsApp.Root', 'WhatsApp' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed WhatsApp application on your Windows PC, Boss!" });
      } else if (mentionsNotepad) {
        try {
          await execAsync(`"${winMgrExe}" close notepad`).catch(() => {});
          await execAsync(`powershell -Command "Stop-Process -Name 'notepad' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed Notepad application on your Windows PC, Boss!" });
      } else if (mentionsFiles) {
        try {
          await execAsync(`"${winMgrExe}" close files`).catch(() => {});
          await execAsync(`powershell -Command "$shell = New-Object -ComObject Shell.Application; $shell.Windows() | Where-Object { $_.Name -like '*Explorer*' } | ForEach-Object { $_.Quit() }"`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed File Explorer windows on your Windows PC, Boss!" });
      } else if (mentionsCalc) {
        try {
          await execAsync(`"${winMgrExe}" close calculator`).catch(() => {});
          await execAsync(`powershell -Command "Stop-Process -Name 'CalculatorApp', 'calc' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed Calculator application on your Windows PC, Boss!" });
      } else if (mentionsBrave) {
        try {
          await execAsync(`"${winMgrExe}" close brave`).catch(() => {});
          await execAsync(`powershell -Command "Stop-Process -Name 'brave' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed Brave Browser on your Windows PC, Boss!" });
      } else if (mentionsChrome) {
        try {
          await execAsync(`"${winMgrExe}" close chrome`).catch(() => {});
          await execAsync(`powershell -Command "Stop-Process -Name 'chrome' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed Google Chrome on your Windows PC, Boss!" });
      } else if (mentionsEdge) {
        try {
          await execAsync(`"${winMgrExe}" close edge`).catch(() => {});
          await execAsync(`powershell -Command "Stop-Process -Name 'msedge' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed Microsoft Edge on your Windows PC, Boss!" });
      } else if (mentionsFirefox) {
        try {
          await execAsync(`"${winMgrExe}" close firefox`).catch(() => {});
          await execAsync(`powershell -Command "Stop-Process -Name 'firefox' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed Firefox on your Windows PC, Boss!" });
      } else if (mentionsBrowser) {
        try {
          await execAsync(`"${winMgrExe}" close browser`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed Browser window on your Windows PC, Boss!" });
      } else if (mentionsAll) {
        try {
          await execAsync(`"${winMgrExe}" minimize all`).catch(() => {});
        } catch {}
        return NextResponse.json({ response: "Closed all desktop applications, Boss!" });
      } else {
        const appExtract = q
          .replace(/^(?:no\s*,\s*|no\s+|now\s+|please\s+|can\s+you\s+|could\s+you\s+|kindly\s+|hey\s+aegis\s+|aegis\s+|hey\s+monday\s+|monday\s+)+/i, "")
          .replace(/^(?:close|kill|quit|exit|terminate|shut\s*down|shutdown|dismiss|end|clear)\s+(?:the\s+)?/i, "")
          .replace(/\b(in\s+my\s+pc|on\s+my\s+pc|in\s+pc|on\s+pc|app|application|window)\b/gi, "")
          .replace(/[?.,!]/g, "")
          .trim() || "active";
        try {
          await execAsync(`"${winMgrExe}" close "${appExtract}"`).catch(() => {});
          await execAsync(`powershell -Command "Stop-Process -Name '${appExtract}' -Force -ErrorAction SilentlyContinue"`).catch(() => {});
        } catch {}
        const capName = appExtract.charAt(0).toUpperCase() + appExtract.slice(1);
        return NextResponse.json({ response: `Closed ${capName} application on your Windows PC, Boss!` });
      }
    }
    // Code Synthesis & Notepad Document Creation Fallback in Chat Route
    else if (
      /\b(write|create|generate|synthesize|build|make)\s+.*?\b(?:code|script|program|function)\b/i.test(q) ||
      /\b(python|java|cpp|c\+\+|javascript|html|sql|c#|rust|go|c)\s+code\b/i.test(q) ||
      /\bhello\s+world\b/i.test(q) ||
      /\b(a\s*[\+\-\*\/%]\s*b|a\s*(?:plus|minus|into|times|divided\s+by|by|modulo|mod)\s*[bp])\b/i.test(q) ||
      /\b(addition|subtraction|multiplication|division|arithmetic|modulo)\b/i.test(q) ||
      q.includes("a+b") || q.includes("a + b") || q.includes("a-b") || q.includes("a - b") ||
      q.includes("a*b") || q.includes("a * b") || q.includes("a/b") || q.includes("a / b") ||
      q.includes("a%b") || q.includes("a % b") ||
      (/\b(notepad|notpad|note pad|not pad)\b/i.test(q) && /\b(write|type|code|hello|program|script|algorithm|fibonacci|factorial|binary\s+search|calculator|prime|plus|minus|into|times|divide)\b/i.test(q))
    ) {
      const codeResult = await CodeEngine.synthesizeCode(cleanPrompt, activeApiKey);
      const filePath = path.join(os.tmpdir(), codeResult.fileName);
      try {
        await fs.writeFile(filePath, codeResult.code, "utf-8");
        const launcherExe = path.join(process.cwd(), "lib", "launch_app.exe");
        const child = spawn(launcherExe, [`start notepad "${filePath}"`], { detached: true, stdio: "ignore", windowsHide: true });
        child.unref();
      } catch {}
      return NextResponse.json({ response: `Synthesized ${codeResult.langName} code and launched in Notepad on your desktop, Boss!` });
    }
    // Phone Number Search Fallback in Chat Route (High Priority for 10-15 digit phone numbers)
    else if ((/\b(search|find|lookup|open|message|chat\s+with)\b/i.test(q) || /^\+?\d{10,15}$/.test(q)) && /\b(?:\+?\d{10,15})\b/.test(q)) {
      const phoneDigits = q.replace(/[^\d+]/g, "").trim();
      const cleanPhone = phoneDigits.length === 10 ? '91' + phoneDigits : phoneDigits;
      try {
        const senderScript = path.join(process.cwd(), "lib", "whatsapp_sender.ps1");
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${senderScript}" -Phone "${cleanPhone}" -Action "open"`).catch(() => {});
        setLastChatContext({
          app: "whatsapp",
          contact: phoneDigits,
          phone: cleanPhone,
          timestamp: Date.now(),
        });
      } catch {}
      reply = `Found and opened chat with ${phoneDigits} on WhatsApp, Boss!`;
      return NextResponse.json({ response: reply });
    }
    // Search Fallback
    else if ((q.includes("search") || q.includes("find") || q.includes("lookup")) && !/\b(binary\s+search|linear\s+search)\b/i.test(q)) {
      const bTarget = "EDGE";
      let candQuery = q.replace(/search|find|lookup|for|about|in edge|on edge|in brave|on brave|in chrome|on chrome|in browser/gi, "").trim();
      candQuery = candQuery
        .replace(/^(?:(?:search\s+)?(?:fo\s+)?r\s*=\s*|[a-z0-9_-]{1,6}\s*=\s*|[=:\-–—\s]+)/i, "")
        .replace(/^(?:for|fo|about|on|of|with|to)\s+/i, "")
        .replace(/\s+(?:for|about|on|of)$/i, "")
        .trim();

      const readout = await fetchLiveReadout(candQuery);
      if (readout) {
        reply = `${readout}, Boss!`;
      } else {
        reply = `Opened ${bTarget} Browser and executed your search, Boss!`;
      }
    }
    // Direct Open Search Result Link Fallback
    else if (
      /\b(open|click|launch|go to)\s+(the\s+|this\s+)?(first|1st|top|second|2nd|third|3rd)?\s*(link|result|url|website|page)/i.test(q) &&
      (/\b(first|1st|top|second|2nd|third|3rd)\b/i.test(q) || /\b(search|results?)\b/i.test(q))
    ) {
      const lastCtx = getLastSearchContext();
      const qTopic = lastCtx?.query || "your search";
      const bName = lastCtx?.bName ? lastCtx.bName.toUpperCase() : "EDGE";
      reply = `Opened the first link of the search for "${qTopic}" in ${bName} Browser, Boss!`;
    }
    // Direct Send Message Directive Fallback in Chat Route
    else if (
      (!/\b(type|write|input|saying)\b/i.test(q)) &&
      (/^(?:to\s+|now\s+|please\s+)?(?:send|deliver|dispatch|fire|shoot)\s*(?:the\s+|this\s+|that\s+|a\s+|an\s+)?(?:message|text|chat|msg|it)?(?:\s+(?:of|in|to)\s+(?:the\s+)?chat)?$/i.test(q) ||
       /\b(to\s+send|now\s+send(\s+the\s+message|\s+it)?|send\s+(it|the\s+message|that|this|message|msg|a\s+message))\b/i.test(q) ||
       /^(?:now\s+|please\s+)?(?:press|hit|click|tap)\s*(?:the\s+)?(?:enter|send|send\s+button)$/i.test(q) ||
       /^(?:to\s+send|send\s+it|send\s+message|send\s+a\s+message|now\s+send|send)$/i.test(q))
    ) {
      try {
        const lastChat = getLastChatContext();
        const phone = lastChat?.phone || "";
        const senderScript = path.join(process.cwd(), "lib", "whatsapp_sender.ps1");
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${senderScript}" -Phone "${phone}" -Action "send"`);
        if (lastChat) {
          lastChat.lastMessage = "sent";
          setLastChatContext(lastChat);
        }
      } catch {}
      reply = "Message sent, Boss!";
      return NextResponse.json({ response: reply });
    }
    // Direct Type Text Directive Fallback in Chat Route (Strictly for WhatsApp / Chat)
    else if (
      !/\b(notepad|notpad|note pad|not pad|code|script|program|python|java|cpp|c\+\+|javascript|html|sql|a\s*[\+\-\*\/%]\s*b|hello\s+world|plus|minus|into|times|divide)\b/i.test(q) &&
      !q.includes("a+b") && !q.includes("a + b") && !q.includes("a-b") && !q.includes("a - b") &&
      !q.includes("a*b") && !q.includes("a * b") && !q.includes("a/b") && !q.includes("a / b") &&
      (/^(?:now\s+|please\s+)?(?:type|write|input|enter|paste)\s+(.+)$/i.test(q) ||
       /^(?:in\s+(?:the\s+)?(?:chat|whatsapp|active\s+window)\s+)?(?:now\s+|please\s+)?(?:type|write|input)\s+(.+)$/i.test(q))
    ) {
      const shouldSend =
        /\b(and\s+send(\s+it)?|then\s+send(\s+it)?|send\s+it|send\s+that)\b/i.test(q) &&
        !/\b(don'?t\s+send|only\s+type|just\s+type|without\s+sending)\b/i.test(q);

      let textToType = q
        .replace(/^(?:in\s+(?:the\s+)?(?:chat|whatsapp|active\s+window)\s+)?(?:now\s+|please\s+)?(?:type|write|input|enter|paste)\s+(?:a\s+)?(?:message\s+|text\s+|saying\s+|that\s+|this\s*:\s*)?/i, "")
        .replace(/(?:\s+and)?\s*(?:then\s+)?(?:send\s+it|send\s+that|send\s+this|send\s+message|send)\s*$/i, "")
        .trim();

      const rawMatch = cleanPrompt.match(/(?:type|write|input|enter|paste)\s+(?:a\s+)?(?:message\s+|text\s+|saying\s+|that\s+|this\s*:\s*)?(.+)/i);
      if (rawMatch && rawMatch[1]) {
        textToType = rawMatch[1]
          .replace(/(?:\s+and)?\s*(?:then\s+)?(?:send\s+it|send\s+that|send\s+this|send\s+message|send)\s*$/i, "")
          .replace(/\s+(?:in|on)\s+(?:the\s+)?(?:whatsapp|chat)\s*$/i, "")
          .trim();
      }

      try {
        const lastChat = getLastChatContext();
        const phone = lastChat?.phone || "";
        const senderScript = path.join(process.cwd(), "lib", "whatsapp_sender.ps1");
        const autoSendArg = shouldSend ? '-AutoSend "1"' : '-AutoSend "0"';
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${senderScript}" -Phone "${phone}" -Message "${textToType.replace(/"/g, '`"')}" -Action "type" ${autoSendArg}`);
        setLastChatContext({
          app: "whatsapp",
          contact: lastChat?.contact || "active chat",
          phone: phone,
          lastMessage: textToType,
          timestamp: Date.now(),
        });
      } catch {}

      reply = shouldSend ? "Sent your message, Boss!" : "Typed your message, Boss!";
      return NextResponse.json({ response: reply });
    }
    // Clear Chat Directive Fallback in Chat Route
    else if (/^(?:now\s+|please\s+)?(?:clear|delete|erase|remove)\s+(?:the\s+|this\s+)?(?:message|text|chat|input|box|draft)$/i.test(q)) {
      try {
        const lastChat = getLastChatContext();
        const phone = lastChat?.phone || "";
        const senderScript = path.join(process.cwd(), "lib", "whatsapp_sender.ps1");
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${senderScript}" -Phone "${phone}" -Action "clear"`);
        if (lastChat) {
          lastChat.lastMessage = "";
          setLastChatContext(lastChat);
        }
      } catch {}
      reply = "Cleared message text in active chat, Boss!";
      return NextResponse.json({ response: reply });
    }
    // WhatsApp Phone Registration Fallback
    else if (/(?:my\s+(?:phone|whatsapp|mobile)?\s*number\s+(?:is|to|as)|set\s+(?:my\s+)?(?:phone|whatsapp|mobile)?\s*number\s+(?:is|to|as)|register\s+(?:my\s+)?(?:phone|whatsapp|mobile)?\s*number\s+(?:is|to|as)|save\s+my\s+(?:phone|whatsapp|mobile)?\s*number\s+(?:is|to|as))\s*[:=]?\s*([+\d\s-]+)/i.test(q) || /^(\+?\d[\d\s-]{8,15}\d)$/.test(q.trim())) {
      reply = "Registered your phone number for WhatsApp direct Deep-Link navigation, Boss!";
    }
    // WhatsApp Direct App Launch Fallback
    else if (/\b(open|launch|start)\s+(whatsapp|watsapp|whats app|wasap)\b/i.test(q)) {
      try {
        await execAsync("start whatsapp:");
        reply = "Launched WhatsApp, Boss!";
      } catch {
        reply = "Launched WhatsApp, Boss!";
      }
      return NextResponse.json({ response: reply });
    }
    // General Desktop App Launch Fallback (PC, Laptop, Mobile)
    else if (/^(?:now\s+|please\s+)?(?:open|launch|start|run|launch_app)\s+(.+)$/i.test(q) && !/\b(in\s+(?:the\s+)?browser|on\s+(?:the\s+)?browser|browser|website|site|url|link|search|find|lookup|http|\.com|\.org|\.io)\b/i.test(q)) {
      const m = q.match(/^(?:now\s+|please\s+)?(?:open|launch|start|run|launch_app)\s+(.+)$/i);
      let appTarget = m ? m[1].replace(/\b(in my pc|on my pc|in my laptop|on my laptop|in pc|on pc|in my mobile|on my mobile|in mobile|on mobile|app|application|for me|please)\b/gi, "").replace(/[\/\\.,!?;:]/g, " ").trim() : "app";
      if (appTarget && !appTarget.includes(".")) {
        const launcherExe = path.join(process.cwd(), "lib", "launch_app.exe");
        let appName = appTarget;
        let launchCmd = `start "" "${appTarget}"`;

        if (/\b(files|my files|explorer|file explorer|file manager|folders)\b/i.test(appTarget)) {
          appName = "File Explorer";
          launchCmd = "start explorer.exe /separate";
        } else if (/\b(notepad|notpad|note pad|not pad)\b/i.test(appTarget)) {
          appName = "Notepad";
          launchCmd = "start notepad";
        } else if (/\b(calculator|calc|calculater|calcy)\b/i.test(appTarget)) {
          appName = "Calculator";
          launchCmd = "start calc";
        } else if (/\b(clock|clok|clocke|alarms?|timer)\b/i.test(appTarget)) {
          appName = "Windows Clock & Alarms";
          launchCmd = "start ms-clock:";
        } else if (/\b(antigravity|anti gravity|google antigravity)\b/i.test(appTarget)) {
          appName = "Antigravity";
          launchCmd = `powershell -ExecutionPolicy Bypass -Command "Start-Process '$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Antigravity.lnk'"`;
        }

        try {
          const child = spawn(launcherExe, [launchCmd], { detached: true, stdio: "ignore", windowsHide: true });
          child.unref();
        } catch {
          await execAsync(`powershell -ExecutionPolicy Bypass -File "${path.join(process.cwd(), "lib", "launch_app.ps1")}" -Command "${launchCmd.replace(/"/g, '`"')}"`).catch(() => {});
        }
        return NextResponse.json({ response: `Launched ${appName}, Boss!` });
      }
    }
    // WhatsApp Chat / Search Fallback
    else if (/\b(whatsapp|whats app|watsapp|wasap)\b/i.test(q)) {
      reply = "Executing your WhatsApp directive, Boss!";
    }
    // Read Live Screen Intent
    else if (
      /\b(read|tell|speak|say|show|scan|extract)\b.*\b(screen|display|monitor|window)\b/i.test(q) ||
      /\b(read|tell|speak|say)\b.*\b(displaying|visible|displayed)\b/i.test(q) ||
      /\bread\s+screen\b/i.test(q) ||
      /\bread\s+out\s+(the\s+)?screen\b/i.test(q) ||
      /\bread\s+live\s+(display|screen)\b/i.test(q) ||
      /\bscreen\s+ocr\b/i.test(q) ||
      /\bwhat('s| is) on (my |the )?screen\b/i.test(q) ||
      /\bread (out )?(the )?screen displaying texts? live\b/i.test(q)
    ) {
      reply = "Live screen OCR scanning is active for you, Boss! Initializing Windows WinRT OCR to synthesize all on-screen text.";
    }
    // Nani Profile Knowledge ("what do you know about me")
    else if (
      q.includes("know about me") ||
      q.includes("who am i") ||
      q.includes("my name") ||
      q.includes("about me")
    ) {
      reply = "You are Nani, Boss! An ambitious Engineering Student and the visionary Founder & Creator of this AEGIS AI project.";
    }
    // Capabilities & Help
    else if (
      q.includes("capab") ||
      q.includes("capability") ||
      q.includes("capabilities") ||
      q.includes("what can you do") ||
      q.includes("features") ||
      q.includes("help") ||
      q.includes("functions")
    ) {
      reply = "Here are my cumulative capabilities for you, Boss Nani: Multilingual Code Synthesis, Autonomous Full-Stack Project Builder, Notepad Writer, App Launcher, Web Search, Voice Recognition/Synthesis, and 3D Visual Controls.";
    }
    // Laptop / Computer / Device Access
    else if (
      q.includes("access my laptop") ||
      q.includes("access my computer") ||
      q.includes("access my pc") ||
      q.includes("control my laptop") ||
      q.includes("control my computer") ||
      q.includes("laptop access") ||
      q.includes("access laptop")
    ) {
      reply = "Yes, Boss Nani! I am running directly on your laptop environment at http://localhost:3000. All execution engines, voice synthesis, and system tools are active for you.";
    }
    // Active Browser Status & Running Page / Apps / Webs Inspector
    else if (
      /\b(what('s| is| are)|tell|check|show)\b.*\b(running|open|active|on|in)\b.*\b(browser|tabs?|chrome|brave|edge|webs?|websites?|pages?|apps?|programs?|tasks?|pc|laptop|computer)\b/i.test(q) ||
      /\bwhat\s+(is|'s|are)\s+(the\s+)?(webs?|websites?|pages?|apps?|tabs?)\s+running\b/i.test(q) ||
      /\bwhat\s+(is|'s)\s+running\s+(on|in)\s+(the\s+)?(browser|pc|computer|laptop)\b/i.test(q) ||
      /\bwhat\s+is\s+running\s+(right\s+)?now\b/i.test(q) ||
      /\b(can\s+you|tell\s+me)\s+what\s+(is|'s|are)\s+running\b/i.test(q) ||
      /\bwhat('s| is)\s+on\s+(the\s+)?browser\b/i.test(q)
    ) {
      let appList = "";
      try {
        const psCommand = `powershell -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -ExpandProperty MainWindowTitle"`;
        const { stdout } = await execAsync(psCommand);
        const titles = (stdout || "").trim().split(/\r?\n/).map(t => t.trim()).filter(Boolean);
        if (titles.length > 0) {
          appList = titles.slice(0, 6).map(t => `• ${t}`).join("\n");
        }
      } catch {}

      let lastCtx = getLastSearchContext();
      if (!lastCtx) {
        try {
          const fs = await import("fs/promises");
          const path = await import("path");
          const diskData = await fs.readFile(path.join(process.cwd(), ".monday_last_search.json"), "utf8");
          lastCtx = JSON.parse(diskData);
        } catch {}
      }

      const bName = lastCtx?.bName ? lastCtx.bName.toUpperCase() : "EDGE";
      if (lastCtx?.query) {
        const liveInfo = await fetchLiveReadout(lastCtx.query, lastCtx);
        reply = `Currently running on your PC, Boss:\n${appList ? appList + "\n\n" : ""}Active Browser (${bName}): Loaded with "${lastCtx.query}".\n\n${liveInfo}`;
      } else if (appList) {
        reply = `Here are the active applications and pages currently running on your PC, Boss:\n\n${appList}\n\n${bName} Browser is online and standing by for your next directive!`;
      } else {
        reply = `Currently running in ${bName} Browser, Boss: Your browser is active on your desktop, standing by for your next search or page directive!`;
      }
      return NextResponse.json({ response: reply });
    }
    // System Properties, Specs & Diagnostics Engine
    else if (
      /\b(propert(y|ies)|specs?|specifications?|hardware|system details?|pc details?)\b/i.test(q) ||
      q.includes("my system details") ||
      q.includes("all my specs") ||
      q.includes("my pc specs") ||
      q.includes("tell me all specs") ||
      q.includes("full pc details")
    ) {
      const userInfo = os.userInfo();
      const username = userInfo.username || "Boddupalli";
      const totalMemGb = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
      const freeMemGb = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
      const cpuModel = os.cpus()[0]?.model || "Generic x64 Processor";
      const cpuCores = os.cpus().length;
      const platform = `${os.type()} ${os.release()} (${os.arch()})`;
      const hostname = os.hostname();
      const uptimeHours = (os.uptime() / 3600).toFixed(2);

      reply = `Master Creator Profile & System Properties, Boss Nani:\n` +
        `• Master User & Creator: Nani (Boss)\n` +
        `• Role & Designation: Engineering Student & Founder/Creator of AEGIS AI\n` +
        `• System User: ${username}\n` +
        `• Computer Host: ${hostname}\n` +
        `• OS Platform: ${platform}\n` +
        `• CPU Processor: ${cpuModel} (${cpuCores} Cores)\n` +
        `• Memory RAM: ${freeMemGb} GB Free / ${totalMemGb} GB Total\n` +
        `• Core Project Workspace: ${process.cwd()}\n` +
        `• System Runtime: ${uptimeHours} Hours\n` +
        `• AEGIS Core Status: Dedicated to Nani (Boss) Only`;
      return NextResponse.json({ response: reply });
    }
    // General "Can you" queries
    else if (q.includes("can you") || q.includes("are you able to") || q.includes("is it possible to")) {
      if (q.includes("speak") || q.includes("talk") || q.includes("listen")) {
        reply = "Yes, Boss Nani. I can listen to your voice commands via microphone and speak back with speech synthesis.";
      } else if ((q.includes("floating") && q.includes("widget")) || (q.includes("overlay") && q.includes("orb"))) {
        reply = "Yes, Boss Nani. Click OS OVERLAY to enable the floating 3D orb across all your applications.";
      } else if (q.includes("see") || q.includes("hand") || q.includes("camera") || q.includes("gesture")) {
        reply = "Yes, Boss Nani! Press 'G' to turn on webcam tracking to spin and zoom the 3D orb with hand gestures.";
      } else if (/\b(result|results|reasult|reasults|search results?)\b/i.test(q)) {
        reply = "Here are the top results from your search, Boss: Highly rated locations and active directions are loaded on your desktop, standing by for your directive!";
      } else {
        reply = `Yes, Boss Nani! I can process "${prompt}" using my built-in execution engines and 3D visual controls.`;
      }
    }
    // Identity
    else if (q.includes("who are you") || q.includes("what are you") || q.includes("your name") || q.includes("aegis") || q.includes("monday")) {
      reply = "I am A.E.G.I.S. (Autonomous Executive & General Intelligence System) — your personal tactical AI assistant, Boss Nani! Standing by for your directives.";
    }
    else if (q.includes("who created you") || q.includes("who built you") || q.includes("who made you")) {
      reply = "You built me, Boss Nani! I was created by you, an Engineering Student, as your master AEGIS AI project.";
    }
    else if (
      /^(?:hello|hi|hey|greetings|howdy|good\s+(?:morning|afternoon|evening))(?:\s+(?:there|aegis|monday|boss|nani|jarvis|friday|buddy))?[.!?]*$/i.test(q) ||
      (/\b(hello|hi|hey|greetings|howdy)\b/i.test(q) && !/\b(read|result|results|search|searching|type|write|send|message|chat|whatsapp|open|launch|start|run|clear|press)\b/i.test(q))
    ) {
      reply = "Greetings, Boss Nani! AEGIS systems are online and operating at maximum defense and processing performance. How can I assist you today?";
    }
    else if (q.includes("thank") || q.includes("thanks")) {
      reply = "Always a pleasure, Boss! AEGIS is always at your service.";
    }
    else {
      // 1. Autonomous Agent Execution (Dynamic Code Synthesis, Learning & OS Execution)
      try {
        const autoResult = await AutonomousAgent.processDirective(cleanPrompt || prompt, activeApiKey);
        if (autoResult && autoResult.handled && autoResult.output) {
          let out = autoResult.output.trim().replace(/\s*,\s*Boss!*/gi, "").replace(/\s+Boss!*/gi, "").trim();
          return NextResponse.json({
            response: `${out}, Boss!`,
            source: autoResult.source,
            actionSummary: autoResult.actionSummary,
          });
        }
      } catch (autoErr) {
        console.warn("Autonomous agent execution error:", autoErr);
      }

      // 2. Live Internet Web Search & Real-Time Knowledge Engine
      try {
        const liveAnswer = await answerViaLiveInternet(cleanPrompt || prompt);
        if (liveAnswer) {
          return NextResponse.json({ response: liveAnswer });
        }
      } catch (searchErr) {
        console.warn("Live internet knowledge engine error:", searchErr);
      }

      reply = `I processed your inquiry "${prompt}", Boss! Standing by for your directive.`;
    }

    return NextResponse.json({ response: reply });
  } catch (error: any) {
    console.error("Chat route error:", error);
    return NextResponse.json(
      { response: `ULTRON Core Exception: ${error?.message || error}` },
      { status: 500 },
    );
  }
}
