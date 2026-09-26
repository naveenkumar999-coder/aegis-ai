import fs from "fs/promises";
import path from "path";

export interface LearnedSkill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  language: "powershell" | "node" | "python" | "batch";
  code: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
  parameters?: { name: string; description: string; placeholder: string }[];
}

const DEFAULT_SKILLS: LearnedSkill[] = [
  {
    id: "skill_disk_space",
    name: "Check Drive Space",
    description: "Inspect total and free space across all system drives in GB",
    triggers: ["disk space", "drive space", "storage space", "free space on drive", "hard disk space", "disk usage"],
    language: "powershell",
    code: `Get-PSDrive -PSProvider 'FileSystem' | Select-Object Name, @{Name="FreeGB";Expression={[math]::Round($_.Free/1GB,2)}}, @{Name="UsedGB";Expression={[math]::Round(($_.Used)/1GB,2)}}, @{Name="TotalGB";Expression={[math]::Round(($_.Used + $_.Free)/1GB,2)}} | Format-Table -AutoSize | Out-String`,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    useCount: 1,
  },
  {
    id: "skill_top_processes",
    name: "Top Memory Processes",
    description: "List the top 5 running processes consuming the highest RAM memory",
    triggers: ["top processes", "memory hungry", "high memory", "highest memory", "what is using my ram", "top ram processes"],
    language: "powershell",
    code: `Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 5 ProcessName, @{Name="RAM_MB";Expression={[math]::Round($_.WorkingSet/1MB,1)}}, Id | Format-Table -AutoSize | Out-String`,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    useCount: 1,
  },
  {
    id: "skill_battery_status",
    name: "Battery & Power Status",
    description: "Check laptop battery percentage and power plug status",
    triggers: ["battery", "battery percentage", "battery health", "power status", "is laptop charging", "charging status"],
    language: "powershell",
    code: `Get-WmiObject -Class BatteryStatus -Namespace root\\wmi -ErrorAction SilentlyContinue | ForEach-Object { "Power Online: " + $_.PowerOnline + " | Remaining Capacity: " + $_.RemainingCapacity } ; (Get-WmiObject -Class Win32_Battery -ErrorAction SilentlyContinue) | Select-Object EstimatedChargeRemaining, BatteryStatus, EstimatedRunTime | Out-String`,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    useCount: 1,
  },
  {
    id: "skill_network_ping",
    name: "Network Latency Check",
    description: "Ping google.com to measure internet connectivity and millisecond latency",
    triggers: ["network latency", "ping google", "internet speed", "test latency", "test ping", "is internet working", "ping test"],
    language: "powershell",
    code: `Test-Connection -ComputerName 8.8.8.8 -Count 2 | Select-Object Address, ResponseTime | Out-String`,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    useCount: 1,
  },
  {
    id: "skill_clipboard_read",
    name: "Read Clipboard Text",
    description: "Extract current copied text from Windows clipboard",
    triggers: ["read clipboard", "what is in my clipboard", "clipboard content", "copied text", "show clipboard"],
    language: "powershell",
    code: `Get-Clipboard | Out-String`,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    useCount: 1,
  },
  {
    id: "skill_wifi_networks",
    name: "Scan Wi-Fi Networks",
    description: "Scan all nearby wireless networks and signal quality",
    triggers: ["scan wifi", "available wifi", "show wifi", "wifi networks", "nearby networks", "scan wireless"],
    language: "powershell",
    code: `netsh wlan show networks mode=Bssid | Out-String`,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    useCount: 1,
  },
  {
    id: "skill_active_ports",
    name: "Active Listening Ports",
    description: "Show local listening network ports and services",
    triggers: ["listening ports", "open ports", "active ports", "network ports", "check port"],
    language: "powershell",
    code: `Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess -First 10 | Format-Table -AutoSize | Out-String`,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    useCount: 1,
  },
];

export class SkillStore {
  private static filePath = path.join(process.cwd(), ".monday_skills.json");
  private static memoryCache: LearnedSkill[] | null = null;

  public static async loadSkills(): Promise<LearnedSkill[]> {
    if (this.memoryCache) return this.memoryCache;

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed: LearnedSkill[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.memoryCache = parsed;
        return this.memoryCache;
      }
    } catch {
      // File doesn't exist yet, initialize with defaults
    }

    this.memoryCache = [...DEFAULT_SKILLS];
    await this.saveAll(this.memoryCache);
    return this.memoryCache;
  }

  public static async saveAll(skills: LearnedSkill[]): Promise<void> {
    this.memoryCache = skills;
    try {
      await fs.writeFile(this.filePath, JSON.stringify(skills, null, 2), "utf8");
    } catch (err) {
      console.warn("Failed to persist .monday_skills.json:", err);
    }
  }

  public static async findMatchingSkill(query: string): Promise<LearnedSkill | null> {
    const skills = await this.loadSkills();
    const q = query.toLowerCase().trim();

    // 1. Direct trigger match
    for (const skill of skills) {
      for (const trigger of skill.triggers) {
        if (q.includes(trigger.toLowerCase())) {
          return skill;
        }
      }
    }

    // 2. Keyword score matching
    let bestSkill: LearnedSkill | null = null;
    let highestScore = 0;

    const words = q.split(/\s+/).filter((w) => w.length > 3);
    for (const skill of skills) {
      let score = 0;
      const descLower = skill.description.toLowerCase();
      const nameLower = skill.name.toLowerCase();

      for (const w of words) {
        if (nameLower.includes(w)) score += 3;
        if (descLower.includes(w)) score += 1;
        for (const t of skill.triggers) {
          if (t.toLowerCase().includes(w)) score += 2;
        }
      }

      if (score > highestScore && score >= 4) {
        highestScore = score;
        bestSkill = skill;
      }
    }

    return bestSkill;
  }

  public static async registerSkill(skillData: {
    name: string;
    description: string;
    triggers: string[];
    language: "powershell" | "node" | "python" | "batch";
    code: string;
  }): Promise<LearnedSkill> {
    const skills = await this.loadSkills();
    const cleanId = `skill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // If an existing skill shares almost identical triggers, update it instead
    const existingIndex = skills.findIndex(
      (s) => s.name.toLowerCase() === skillData.name.toLowerCase() ||
             skillData.triggers.some((t) => s.triggers.includes(t))
    );

    const now = new Date().toISOString();
    let saved: LearnedSkill;

    if (existingIndex >= 0) {
      saved = {
        ...skills[existingIndex],
        ...skillData,
        lastUsedAt: now,
        useCount: skills[existingIndex].useCount + 1,
      };
      skills[existingIndex] = saved;
    } else {
      saved = {
        id: cleanId,
        ...skillData,
        createdAt: now,
        lastUsedAt: now,
        useCount: 1,
      };
      skills.push(saved);
    }

    await this.saveAll(skills);
    return saved;
  }

  public static async recordSkillUse(id: string): Promise<void> {
    const skills = await this.loadSkills();
    const skill = skills.find((s) => s.id === id);
    if (skill) {
      skill.lastUsedAt = new Date().toISOString();
      skill.useCount += 1;
      await this.saveAll(skills);
    }
  }

  public static async listSkillsSummary(): Promise<string> {
    const skills = await this.loadSkills();
    if (skills.length === 0) return "No autonomous skills registered yet, Boss!";
    return skills.map((s, idx) => `${idx + 1}. ${s.name} (${s.language}): ${s.description}`).join("\n");
  }

  public static async deleteSkill(nameOrId: string): Promise<boolean> {
    const skills = await this.loadSkills();
    const target = nameOrId.toLowerCase().trim();
    const filtered = skills.filter((s) => s.id.toLowerCase() !== target && s.name.toLowerCase() !== target);
    if (filtered.length !== skills.length) {
      await this.saveAll(filtered);
      return true;
    }
    return false;
  }
}
