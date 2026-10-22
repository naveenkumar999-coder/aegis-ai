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
    let duration = "";
    let transcriptionText = "";
    let callSid = "";
    let recordingSid = "";
    let recordingStatus = "completed";

    const url = new URL(req.url);
    const searchParams = url.searchParams;

    if (searchParams.get("From") || searchParams.get("CallFrom") || searchParams.get("RecordingUrl") || searchParams.get("CallSid")) {
      fromNumber = (searchParams.get("From") || searchParams.get("CallFrom") || searchParams.get("Caller") || fromNumber).toString();
      recordingUrl = (searchParams.get("RecordingUrl") || searchParams.get("recording_url") || recordingUrl).toString();
      callSid = (searchParams.get("CallSid") || searchParams.get("call_sid") || callSid).toString();
      recordingSid = (searchParams.get("RecordingSid") || searchParams.get("recording_sid") || recordingSid).toString();
      recordingStatus = (searchParams.get("RecordingStatus") || recordingStatus).toString();
      const dur = searchParams.get("RecordingDuration") || searchParams.get("DialCallDuration");
      if (dur) duration = `${dur}s`;
      const trans = searchParams.get("TranscriptionText");
      if (trans && trans.trim().length > 0) {
        transcriptionText = trans.trim();
      }
    }

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = (formData.get("From") || formData.get("CallFrom") || formData.get("Caller") || fromNumber).toString();
      recordingUrl = (formData.get("RecordingUrl") || formData.get("recording_url") || recordingUrl).toString();
      callSid = (formData.get("CallSid") || formData.get("call_sid") || callSid).toString();
      recordingSid = (formData.get("RecordingSid") || formData.get("recording_sid") || recordingSid).toString();
      recordingStatus = (formData.get("RecordingStatus") || recordingStatus).toString();
      const dur = formData.get("RecordingDuration") || formData.get("DialCallDuration");
      if (dur) duration = `${dur}s`;
      const trans = formData.get("TranscriptionText");
      if (trans && trans.toString().trim().length > 0) {
        transcriptionText = trans.toString().trim();
      }
    } else if (contentType.includes("application/json")) {
      const json = await req.json();
      fromNumber = json.From || json.CallFrom || json.Caller || json.fromNumber || fromNumber;
      recordingUrl = json.RecordingUrl || json.recording_url || json.recordingUrl || recordingUrl;
      callSid = json.CallSid || json.call_sid || callSid;
      recordingSid = json.RecordingSid || json.recording_sid || recordingSid;
      recordingStatus = json.RecordingStatus || recordingStatus;
      if (json.RecordingDuration) duration = `${json.RecordingDuration}s`;
      if (json.TranscriptionText) transcriptionText = json.TranscriptionText;
    }

    // Ensure audio file extension if twilio URL
    if (recordingUrl && recordingUrl.includes("api.twilio.com") && !recordingUrl.endsWith(".mp3")) {
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

    const hasRecording = Boolean(recordingUrl && recordingUrl.trim().length > 0);
    const hasTranscription = Boolean(transcriptionText && transcriptionText.trim().length > 0);
    const isFailed = recordingStatus === "failed" || (!hasRecording && !hasTranscription);

    const sessionStatus: "intercepted" | "completed" | "ongoing" = hasRecording ? "intercepted" : "completed";
    const displayText = hasTranscription
      ? transcriptionText
      : hasRecording
      ? "Caller left a voice recording."
      : "Call disconnected without voice recording.";

    const sessionSummary = hasRecording
      ? `Voice recording: ${displayText}`
      : "Call disconnected without recording";

    const displayDuration = duration || (hasRecording ? "Voice Rec" : "Completed");

    const proxyAudioUrl = hasRecording
      ? recordingUrl.startsWith("/api/telephony/recording-audio")
        ? recordingUrl
        : `/api/telephony/recording-audio?url=${encodeURIComponent(recordingUrl)}`
      : undefined;

    const newSession: CallSession = {
      id: sessionId,
      callerName: fromNumber,
      callerNumber: fromNumber,
      avatarColor,
      timestamp: timeStr,
      duration: displayDuration,
      unread: true,
      status: sessionStatus,
      urgency: hasRecording ? "urgent" : "normal",
      summary: sessionSummary,
      audioDataUri: proxyAudioUrl,
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
          text: displayText,
          timestamp: timeOnly,
          audioDataUri: proxyAudioUrl,
        },
      ],
    };

    // Idempotent update or insert
    const currentSessions = getServerCallSessions();
    const existingIndex = currentSessions.findIndex(
      (s) => s.id === sessionId || (proxyAudioUrl && s.audioDataUri === proxyAudioUrl) || (recordingUrl && s.audioDataUri?.includes(recordingUrl))
    );

    if (existingIndex >= 0) {
      // Update existing record with final transcription or duration without duplicating
      const existing = currentSessions[existingIndex];
      existing.summary = sessionSummary;
      if (proxyAudioUrl) existing.audioDataUri = proxyAudioUrl;
      if (duration && duration !== "Voice Rec") existing.duration = duration;
      if (existing.messages && existing.messages.length >= 2) {
        existing.messages[1].text = displayText;
        if (proxyAudioUrl) existing.messages[1].audioDataUri = proxyAudioUrl;
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
