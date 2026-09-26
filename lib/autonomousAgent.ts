import { SandboxRunner, SupportedLanguage, ExecutionResult } from "./sandboxRunner";
import { SkillStore, LearnedSkill } from "./skillStore";
import { answerViaLiveInternet } from "./webKnowledge";

export interface AutonomousResult {
  handled: boolean;
  actionSummary: string;
  output: string;
  skillLearned?: boolean;
  learnedSkillName?: string;
  source: "learned_skill" | "synthesized_code" | "web_intelligence" | "meta";
}

export class AutonomousAgent {
  /**
   * Main entry point to process arbitrary commands autonomously.
   */
  public static async processDirective(
    query: string,
    apiKey?: string
  ): Promise<AutonomousResult | null> {
    const q = query.trim();
    if (!q) return null;

    const activeKey = apiKey || process.env.GEMINI_API_KEY;

    // 1. Meta Commands: Manage & Query Learned Skills
    if (
      /\b(what\s+skills?\s+(?:have\s+you|did\s+you|are)\s+learned|list\s+(?:your\s+|all\s+)?skills?|show\s+(?:your\s+|all\s+)?skills?|what\s+can\s+you\s+do\s+now)\b/i.test(q)
    ) {
      const summary = await SkillStore.listSkillsSummary();
      return {
        handled: true,
        actionSummary: "Retrieved Autonomous Skill Bank",
        output: `Here are my autonomous learned skills, Boss:\n${summary}`,
        source: "meta",
      };
    }

    if (/\b(?:forget|delete|remove)\s+skill\s+([a-zA-Z0-9_\s-]+)$/i.test(q)) {
      const match = q.match(/\b(?:forget|delete|remove)\s+skill\s+([a-zA-Z0-9_\s-]+)$/i);
      const target = match ? match[1].trim() : "";
      const deleted = await SkillStore.deleteSkill(target);
      return {
        handled: true,
        actionSummary: "Modified Skill Bank",
        output: deleted
          ? `Removed skill "${target}" from my autonomous memory, Boss!`
          : `Skill "${target}" was not found in my database, Boss!`,
        source: "meta",
      };
    }

    // 2. Check Existing Learned Skills
    const matchingSkill = await SkillStore.findMatchingSkill(q);
    if (matchingSkill) {
      try {
        const execRes = await SandboxRunner.executeCode(
          matchingSkill.code,
          matchingSkill.language
        );
        if (execRes.success) {
          await SkillStore.recordSkillUse(matchingSkill.id);
          const firstLine = execRes.stdout.split("\n")[0] || "Task completed";
          return {
            handled: true,
            actionSummary: `Executed Learned Skill: ${matchingSkill.name}`,
            output: `${matchingSkill.name} executed successfully, Boss: ${firstLine}`,
            source: "learned_skill",
          };
        }
      } catch (skillErr) {
        console.warn(`Execution of skill ${matchingSkill.name} failed, falling through:`, skillErr);
      }
    }

    // 3. Dynamic Synthesis via AI / LLM (if Gemini API key is active)
    if (activeKey) {
      const synthesized = await this.synthesizeAndExecuteWithLLM(q, activeKey);
      if (synthesized && synthesized.handled) {
        return synthesized;
      }
    }

    // 4. Dynamic Heuristic Synthesizer (Zero-config fallback without API key)
    const heuristic = await this.synthesizeHeuristicScript(q);
    if (heuristic) {
      const execRes = await SandboxRunner.executeCode(heuristic.code, heuristic.language);
      if (execRes.success && execRes.stdout) {
        await SkillStore.registerSkill({
          name: heuristic.name,
          description: heuristic.description,
          triggers: heuristic.triggers,
          language: heuristic.language,
          code: heuristic.code,
        });

        const firstLine = execRes.stdout.split("\n")[0] || "Process finished";
        return {
          handled: true,
          actionSummary: `Synthesized & Learned: ${heuristic.name}`,
          output: `Learned new skill "${heuristic.name}" and executed, Boss: ${firstLine}`,
          skillLearned: true,
          learnedSkillName: heuristic.name,
          source: "synthesized_code",
        };
      }
    }

    // 5. Unbounded Real-time Web Knowledge Research
    try {
      const webAnswer = await answerViaLiveInternet(q);
      if (webAnswer) {
        return {
          handled: true,
          actionSummary: "Live Internet Research",
          output: webAnswer,
          source: "web_intelligence",
        };
      }
    } catch (webErr) {
      console.warn("Autonomous web research fallback error:", webErr);
    }

    return null;
  }

  /**
   * Uses LLM to synthesize code, run in sandbox, and apply self-healing error recovery.
   */
  private static async synthesizeAndExecuteWithLLM(
    query: string,
    apiKey: string
  ): Promise<AutonomousResult | null> {
    try {
      const systemPrompt = `You are AEGIS's Autonomous Script Synthesizer on Windows 10/11 x64.
The user gave directive: "${query}".
Synthesize a safe, self-contained, working script (PowerShell preferred, or Node.js / Python) that executes this directive on Windows and writes clean, human-readable results to STDOUT.
Output ONLY a JSON object with this format (no markdown fences, or wrapped in \`\`\`json):
{
  "language": "powershell",
  "code": "code string here",
  "name": "Concise Skill Name",
  "description": "Short description of what this does",
  "triggers": ["keyword1", "keyword2"]
}
Safety: NEVER format drives, delete system directories, or execute destructive commands.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
            generationConfig: { maxOutputTokens: 600, temperature: 0.2 },
          }),
        }
      );

      if (!response.ok) return null;
      const data = await response.json();
      let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

      let spec: {
        language: SupportedLanguage;
        code: string;
        name: string;
        description: string;
        triggers: string[];
      };
      try {
        spec = JSON.parse(rawText);
      } catch {
        return null;
      }

      if (!spec.code || !spec.language) return null;

      // First execution attempt
      let execRes = await SandboxRunner.executeCode(spec.code, spec.language);

      // Self-Healing Loop: If failed, request refinement from LLM with stderr
      if (!execRes.success && execRes.stderr) {
        console.warn(`[Autonomous Sandbox] Initial execution failed: ${execRes.stderr}. Initiating self-healing...`);
        const healPrompt = `The previous script failed on Windows with error:\n${execRes.stderr}\nOriginal Goal: "${query}"\nBroken Code:\n${spec.code}\n\nFix the code and output ONLY the corrected JSON object.`;
        const healRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: healPrompt }] }],
              generationConfig: { maxOutputTokens: 600, temperature: 0.1 },
            }),
          }
        );

        if (healRes.ok) {
          const healData = await healRes.json();
          let healText = healData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          healText = healText.replace(/```json/gi, "").replace(/```/g, "").trim();
          try {
            const fixedSpec = JSON.parse(healText);
            if (fixedSpec.code) {
              spec.code = fixedSpec.code;
              execRes = await SandboxRunner.executeCode(spec.code, spec.language);
            }
          } catch {}
        }
      }

      if (execRes.success) {
        await SkillStore.registerSkill({
          name: spec.name || "Dynamic Automation",
          description: spec.description || query,
          triggers: spec.triggers || [query.toLowerCase()],
          language: spec.language,
          code: spec.code,
        });

        const firstLine = execRes.stdout.split("\n")[0] || "Process completed";
        return {
          handled: true,
          actionSummary: `Synthesized & Learned: ${spec.name}`,
          output: `Learned new skill "${spec.name}" and executed, Boss: ${firstLine}`,
          skillLearned: true,
          learnedSkillName: spec.name,
          source: "synthesized_code",
        };
      }
    } catch (err) {
      console.warn("Synthesize with LLM error:", err);
    }
    return null;
  }

  /**
   * Built-in heuristic script generation for dynamic system operations when offline or no API key.
   */
  private static async synthesizeHeuristicScript(
    query: string
  ): Promise<{
    name: string;
    description: string;
    triggers: string[];
    language: SupportedLanguage;
    code: string;
  } | null> {
    const q = query.toLowerCase();

    // 1. Check IP address or network configuration
    if (/\b(?:ip\s*address|my\s*ip|local\s*ip|network\s*configuration|ipconfig)\b/i.test(q)) {
      return {
        name: "Check IP Configuration",
        description: "Retrieves local network IPv4 and IPv6 addresses and default gateway",
        triggers: ["ip address", "my ip", "local ip", "network config"],
        language: "powershell",
        code: `Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*"} | Select-Object InterfaceAlias, IPAddress | Format-Table -AutoSize | Out-String`,
      };
    }

    // 2. Installed Software / Apps List
    if (/\b(?:installed\s+(?:apps|software|programs)|list\s+installed|what\s+is\s+installed)\b/i.test(q)) {
      return {
        name: "List Installed Applications",
        description: "Scans Windows registry to list installed desktop applications",
        triggers: ["installed apps", "installed software", "list installed", "what is installed"],
        language: "powershell",
        code: `Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName, DisplayVersion | Where-Object DisplayName -ne $null | Select-Object -First 10 | Format-Table -AutoSize | Out-String`,
      };
    }

    // 3. System Uptime & Boot Time
    if (/\b(?:uptime|system\s+uptime|how\s+long\s+has\s+pc\s+been\s+on|last\s+boot)\b/i.test(q)) {
      return {
        name: "System Uptime",
        description: "Retrieves Windows last boot time and active system uptime",
        triggers: ["uptime", "system uptime", "how long has pc been on", "last boot"],
        language: "powershell",
        code: `(Get-CimInstance -ClassName Win32_OperatingSystem) | Select-Object LastBootUpTime, @{Name="UptimeHours";Expression={[math]::Round(((Get-Date) - $_.LastBootUpTime).TotalHours, 2)}} | Format-Table -AutoSize | Out-String`,
      };
    }

    // 4. Find Large Files
    if (/\b(?:large\s+files|biggest\s+files|find\s+files\s+larger\s+than|heavy\s+files)\b/i.test(q)) {
      return {
        name: "Find Large Files",
        description: "Searches the user folder for files exceeding 100 megabytes",
        triggers: ["large files", "biggest files", "heavy files", "huge files"],
        language: "powershell",
        code: `Get-ChildItem -Path $HOME -Recurse -File -ErrorAction SilentlyContinue | Where-Object {$_.Length -gt 100MB} | Sort-Object Length -Descending | Select-Object -First 5 Name, @{Name="SizeMB";Expression={[math]::Round($_.Length/1MB,1)}}, FullName | Format-Table -AutoSize | Out-String`,
      };
    }

    // 5. Windows Update Status
    if (/\b(?:windows\s+updates?|check\s+updates?|pending\s+updates?)\b/i.test(q)) {
      return {
        name: "Check Windows Update Status",
        description: "Checks recent Windows Update hotfixes and install dates",
        triggers: ["windows update", "recent updates", "check updates", "update status"],
        language: "powershell",
        code: `Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 5 HotFixID, Description, InstalledOn | Format-Table -AutoSize | Out-String`,
      };
    }

    // 6. Audio Volume or Mute Status
    if (/\b(?:audio\s+volume|system\s+volume|check\s+volume|sound\s+status)\b/i.test(q)) {
      return {
        name: "Audio Status Check",
        description: "Inspects audio device configuration and drivers",
        triggers: ["audio volume", "sound status", "audio devices", "check sound"],
        language: "powershell",
        code: `Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue | Select-Object FriendlyName, Status | Out-String`,
      };
    }

    return null;
  }
}
