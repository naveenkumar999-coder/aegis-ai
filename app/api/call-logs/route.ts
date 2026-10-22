import { NextResponse } from "next/server";
import { CallSession } from "@/lib/callLogStore";
import {
  getServerCallSessions,
  saveServerCallSessions,
  addServerCallSession,
} from "@/lib/serverCallSessions";
import { transcribeRecordingUrl } from "@/lib/voiceTranscriber";

const EXOTEL_SID = process.env.EXOTEL_ACCOUNT_SID || "";
const EXOTEL_KEY = process.env.EXOTEL_API_KEY || "";
const EXOTEL_TOKEN = process.env.EXOTEL_API_TOKEN || "";

async function fetchExotelCalls(): Promise<CallSession[]> {
  try {
    const auth = Buffer.from(`${EXOTEL_KEY}:${EXOTEL_TOKEN}`).toString("base64");
    const res = await fetch(`https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls.json`, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });

    if (!res.ok) return [];

    const data = await res.json();
    const calls = data.Calls || [];

    const colors = ["#25D366", "#00A884", "#128C7E", "#34B7F1", "#075E54"];

    return Promise.all(
      calls.map(async (c: any) => {
        const sid = c.Sid || "";
        const from = c.From || "Unknown Caller";
        const hasRec = Boolean(c.RecordingUrl && c.RecordingUrl.trim().length > 0);
        const audioDataUri = hasRec
          ? `/api/telephony/recording-audio?url=${encodeURIComponent(c.RecordingUrl)}`
          : undefined;

        let transcript = "";
        if (hasRec) {
          transcript = await transcribeRecordingUrl(c.RecordingUrl);
        }

        const dur = c.Duration ? `${c.Duration}s` : hasRec ? "Voice Rec" : "Completed";
        const avatarColor = colors[Math.abs(from.split("").reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0)) % colors.length];

        const callDate = c.StartTime ? new Date(c.StartTime) : new Date();
        const timeStr = "Today, " + callDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const timeOnly = callDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const summary = transcript
          ? `Voice recording: ${transcript}`
          : hasRec
          ? `Voice recording (${dur})`
          : `Call completed (${dur})`;

        const callerMsgText = transcript
          ? transcript
          : hasRec
          ? "Caller left a voice recording."
          : "Call connected and completed.";

        return {
          id: `call-${sid}`,
          callerName: from,
          callerNumber: from,
          avatarColor,
          timestamp: timeStr,
          duration: dur,
          unread: false,
          status: hasRec ? "intercepted" : "completed",
          urgency: hasRec ? "urgent" : "normal",
          summary,
          audioDataUri,
          messages: [
            {
              id: `msg-1-${sid}`,
              sender: "aegis",
              text: "Hello, I am AEGIS, Naveen's personal AI assistant. He is currently unavailable. Please leave your name and message after the beep.",
              timestamp: timeOnly,
              status: "read",
            },
            {
              id: `msg-2-${sid}`,
              sender: "caller",
              text: callerMsgText,
              timestamp: timeOnly,
              audioDataUri,
            },
          ],
        } as CallSession;
      })
    );
  } catch (e) {
    console.warn("Failed to fetch Exotel calls:", e);
    return [];
  }
}

export async function GET() {
  const localSessions = getServerCallSessions();
  const exotelSessions = await fetchExotelCalls();

  // Merge Exotel cloud calls with local sessions (local takes precedence for transcriptions)
  const sessionMap = new Map<string, CallSession>();

  for (const s of exotelSessions) {
    sessionMap.set(s.id, s);
  }

  for (const s of localSessions) {
    const existing = sessionMap.get(s.id);
    if (existing) {
      sessionMap.set(s.id, {
        ...existing,
        ...s,
        audioDataUri: s.audioDataUri || existing.audioDataUri,
      });
    } else {
      sessionMap.set(s.id, s);
    }
  }

  const merged = Array.from(sessionMap.values());

  return NextResponse.json({
    success: true,
    sessions: merged,
  });
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { action, session, sessionId, sender, text, audioDataUri } = data;

    let sessions = getServerCallSessions();

    if (action === "create_session" && session) {
      sessions = addServerCallSession(session);
      return NextResponse.json({ success: true, sessions });
    }

    if (action === "append_message" && sessionId && text) {
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      sessions = sessions.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            audioDataUri: audioDataUri || s.audioDataUri,
            summary: sender === "caller" ? "Voice recording: " + text : s.summary,
            messages: [
              ...s.messages,
              {
                id: "msg-" + Date.now(),
                sender: sender || "caller",
                text,
                timestamp: now,
                status: sender === "aegis" ? "read" : undefined,
                audioDataUri,
              },
            ],
          };
        }
        return s;
      });
      saveServerCallSessions(sessions);
      return NextResponse.json({ success: true, sessions });
    }

    if (action === "sync_all" && Array.isArray(data.sessions)) {
      saveServerCallSessions(data.sessions);
      return NextResponse.json({ success: true, sessions: data.sessions });
    }

    return NextResponse.json({ success: true, sessions });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
