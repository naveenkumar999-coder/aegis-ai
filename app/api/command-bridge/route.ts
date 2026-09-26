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

// In-memory real-time command queue for cross-device relay
let commandQueue: CrossDeviceCommand[] = [];

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

  return NextResponse.json({ commands: pendingCommands });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sourceDevice, targetDevice, query, action, result } = body;

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

    return NextResponse.json({ success: true, command: newCmd });
  } catch (err) {
    return NextResponse.json({ error: "Failed to queue command" }, { status: 500 });
  }
}
