import { NextResponse } from "next/server";
import { CallSession } from "@/lib/callLogStore";
import {
  getServerCallSessions,
  saveServerCallSessions,
  addServerCallSession,
} from "@/lib/serverCallSessions";

export async function POST(req: Request) {
  try {
    let fromNumber = "Unknown Caller";
    let recordingUrl = "";
    let duration = "Voice Rec";
    let transcriptionText = "Caller left a voice message.";
    let callSid = "";
    let recordingSid = "";
    let recordingStatus = "completed";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = (formData.get("From") || formData.get("Caller") || "Unknown Caller").toString();
      recordingUrl = (formData.get("RecordingUrl") || "").toString();
      callSid = (formData.get("CallSid") || formData.get("call_sid") || "").toString();
      recordingSid = (formData.get("RecordingSid") || formData.get("recording_sid") || "").toString();
      recordingStatus = (formData.get("RecordingStatus") || "completed").toString();
      const dur = formData.get("RecordingDuration");
      if (dur) duration = `${dur}s`;
      const trans = formData.get("TranscriptionText");
      if (trans && trans.toString().trim().length > 0) {
        transcriptionText = trans.toString().trim();
      }
    } else if (contentType.includes("application/json")) {
      const json = await req.json();
      fromNumber = json.From || json.Caller || json.fromNumber || "Unknown Caller";
      recordingUrl = json.RecordingUrl || json.recordingUrl || "";
      callSid = json.CallSid || json.call_sid || "";
      recordingSid = json.RecordingSid || json.recording_sid || "";
      recordingStatus = json.RecordingStatus || "completed";
      if (json.RecordingDuration) duration = `${json.RecordingDuration}s`;
      if (json.TranscriptionText) transcriptionText = json.TranscriptionText;
    }

    // Ensure audio file extension if twilio URL
    if (recordingUrl && !recordingUrl.endsWith(".mp3") && !recordingUrl.endsWith(".wav") && !recordingUrl.startsWith("data:")) {
      recordingUrl = `${recordingUrl}.mp3`;
    }

    const now = Date.now();
    // Strict Idempotency: Use CallSid or RecordingSid as unique persistent key
    const uniqueKey = callSid || recordingSid || `${now}`;
    const sessionId = `call-${uniqueKey}`;
    const timeStr = "Today, " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const timeOnly = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const colors = ["#25D366", "#00A884", "#128C7E", "#34B7F1", "#075E54"];
    const avatarColor = colors[Math.abs(fromNumber.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colors.length];

    const isFailed = recordingStatus === "failed" || (!recordingUrl && !transcriptionText);
    const sessionStatus: "intercepted" | "completed" | "ongoing" = isFailed ? "completed" : "intercepted";
    const sessionSummary = isFailed
      ? "Call disconnected without recording"
      : `Voice recording: ${transcriptionText}`;

    const newSession: CallSession = {
      id: sessionId,
      callerName: fromNumber,
      callerNumber: fromNumber,
      avatarColor,
      timestamp: timeStr,
      duration,
      unread: true,
      status: sessionStatus,
      urgency: "urgent",
      summary: sessionSummary,
      audioDataUri: recordingUrl || undefined,
      messages: [
        {
          id: `msg-1-${uniqueKey}`,
          sender: "aegis",
          text: "Hello, I am AEGIS, Naveen's personal AI assistant. He is currently unavailable. Please leave your name and message after the beep.",
          timestamp: timeOnly,
          status: "read",
        },
        {
          id: `msg-2-${uniqueKey}`,
          sender: "caller",
          text: transcriptionText,
          timestamp: timeOnly,
          audioDataUri: recordingUrl || undefined,
        },
      ],
    };

    // Idempotent update or insert
    const currentSessions = getServerCallSessions();
    const existingIndex = currentSessions.findIndex(
      (s) => s.id === sessionId || (recordingUrl && s.audioDataUri === recordingUrl)
    );

    if (existingIndex >= 0) {
      // Update existing record with final transcription or duration without duplicating
      const existing = currentSessions[existingIndex];
      existing.summary = sessionSummary;
      if (recordingUrl && !existing.audioDataUri) existing.audioDataUri = recordingUrl;
      if (duration && duration !== "Voice Rec") existing.duration = duration;
      if (existing.messages && existing.messages.length >= 2) {
        existing.messages[1].text = transcriptionText;
        if (recordingUrl) existing.messages[1].audioDataUri = recordingUrl;
      }
      saveServerCallSessions(currentSessions);
    } else {
      addServerCallSession(newSession);
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("Recording callback error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
