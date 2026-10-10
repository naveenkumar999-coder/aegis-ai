import { NextResponse } from "next/server";
import { CallSession } from "@/lib/callLogStore";

let inMemorySessions: CallSession[] = [];

export async function GET() {
  return NextResponse.json({
    success: true,
    sessions: inMemorySessions,
  });
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { action, session, sessionId, sender, text } = data;

    if (action === "create_session" && session) {
      inMemorySessions = [session, ...inMemorySessions.filter((s) => s.id !== session.id)];
      return NextResponse.json({ success: true, sessions: inMemorySessions });
    }

    if (action === "append_message" && sessionId && text) {
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      inMemorySessions = inMemorySessions.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: [
              ...s.messages,
              {
                id: "msg-" + Date.now(),
                sender: sender || "caller",
                text,
                timestamp: now,
                status: sender === "aegis" ? "read" : undefined,
              },
            ],
          };
        }
        return s;
      });
      return NextResponse.json({ success: true, sessions: inMemorySessions });
    }

    if (action === "sync_all" && Array.isArray(data.sessions)) {
      inMemorySessions = data.sessions;
      return NextResponse.json({ success: true, sessions: inMemorySessions });
    }

    return NextResponse.json({ success: true, sessions: inMemorySessions });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
