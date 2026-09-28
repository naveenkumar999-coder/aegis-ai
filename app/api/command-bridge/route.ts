import { NextResponse } from "next/server";

export interface CrossDeviceCommand {
  id: string;
  sourceDevice: "pc" | "mobile";
  targetDevice: "pc" | "mobile" | "both";
  query: string;
  timestamp: number;
  status: "pending" | "executed";
  result?: string;
}

export interface SharedAiState {
  voiceCharacter: "friday" | "ultron" | "jarvis";
  themeColor: string;
  sttLang: string;
  geminiApiKey?: string;
  lastUpdated: number;
  updatedBy: "pc" | "mobile";
}

// In-memory real-time command queue for cross-device relay
let commandQueue: CrossDeviceCommand[] = [];

// Shared synchronized state between PC & Mobile (ONE unified AI)
let sharedAiState: SharedAiState = {
  voiceCharacter: "friday",
  themeColor: "gold",
  sttLang: "en-IN",
  lastUpdated: Date.now(),
  updatedBy: "pc",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const device = searchParams.get("device") as "pc" | "mobile" | null;

  if (!device) {
    return NextResponse.json({ error: "device parameter required" }, { status: 400 });
  }

  // Filter pending commands targeted for this device
  const pendingCommands = commandQueue.filter(
    (cmd) => cmd.status === "pending" && (cmd.targetDevice === device || cmd.targetDevice === "both") && cmd.sourceDevice !== device
  );

  // Mark retrieved commands as executed
  pendingCommands.forEach((cmd) => {
    cmd.status = "executed";
  });

  // Keep queue clean (keep last 50 items)
  if (commandQueue.length > 50) {
    commandQueue = commandQueue.slice(-50);
  }

  return NextResponse.json({
    commands: pendingCommands,
    sharedState: sharedAiState,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sourceDevice, targetDevice, query, action, result, settings } = body;

    // Handle synchronized AI state updates (Voice character, Theme, API Key)
    if (action === "sync_settings" && settings) {
      sharedAiState = {
        ...sharedAiState,
        ...settings,
        lastUpdated: Date.now(),
        updatedBy: sourceDevice || "pc",
      };
      return NextResponse.json({ success: true, sharedState: sharedAiState });
    }

    // Handle posting execution feedback result back to source
    if (action === "report_result") {
      const existing = commandQueue.find((cmd) => cmd.id === body.id);
      if (existing) {
        existing.result = result;
      }
      return NextResponse.json({ success: true });
    }

    if (!sourceDevice || !targetDevice || !query) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const newCmd: CrossDeviceCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sourceDevice,
      targetDevice,
      query,
      timestamp: Date.now(),
      status: "pending",
    };

    commandQueue.push(newCmd);

    return NextResponse.json({ success: true, command: newCmd, sharedState: sharedAiState });
  } catch (err) {
    return NextResponse.json({ error: "Failed to queue command" }, { status: 500 });
  }
}
