import { NextResponse } from "next/server";
import { CallSession } from "@/lib/callLogStore";
import { addServerCallSession } from "@/lib/serverCallSessions";

export async function POST(req: Request) {
  try {
    let callerName = "Prof. Sharma (Dept HOD)";
    let callerNumber = "+91 98765 43210";
    let transcriptionText =
      "Hello Naveen, this is Professor Sharma. I reviewed the project presentation slides and the assistant design looks very clean. Please call me back once you are free.";

    try {
      const json = await req.json();
      if (json.callerName) callerName = json.callerName;
      if (json.callerNumber) callerNumber = json.callerNumber;
      if (json.transcriptionText) transcriptionText = json.transcriptionText;
    } catch {
      // default test params
    }

    const now = Date.now();
    const sessionId = `call-${now}`;
    const timeStr = "Today, " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const timeOnly = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const colors = ["#25D366", "#00A884", "#128C7E", "#34B7F1", "#075E54"];
    const avatarColor = colors[Math.abs(callerNumber.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colors.length];

    // Generate valid 2-second WAV audio tone base64 data URI
    const sampleRate = 8000;
    const durationSec = 2.0;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = Buffer.alloc(44 + numSamples);

    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + numSamples, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate, 28);
    buffer.writeUInt16LE(1, 32);
    buffer.writeUInt16LE(8, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(numSamples, 40);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let val = 128;
      if (t < 0.6) {
        val += 48 * Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 2);
      } else if (t < 1.2) {
        val += 52 * Math.sin(2 * Math.PI * 554.37 * (t - 0.6)) * Math.exp(-(t - 0.6) * 2);
      } else {
        val += 56 * Math.sin(2 * Math.PI * 659.25 * (t - 1.2)) * Math.exp(-(t - 1.2) * 2);
      }
      buffer.writeUInt8(Math.min(255, Math.max(0, Math.floor(val))), 44 + i);
    }

    const audioDataUri = "data:audio/wav;base64," + buffer.toString("base64");

    const newSession: CallSession = {
      id: sessionId,
      callerName,
      callerNumber,
      avatarColor,
      timestamp: timeStr,
      duration: "Voice Rec",
      unread: true,
      status: "intercepted",
      urgency: "urgent",
      summary: `Voice recording: ${transcriptionText}`,
      audioDataUri,
      messages: [
        {
          id: `msg-1-${now}`,
          sender: "aegis",
          text: "Hello, I am AEGIS, Naveen's personal AI assistant. He is currently unavailable. Please leave your name and message after the beep.",
          timestamp: timeOnly,
          status: "read",
        },
        {
          id: `msg-2-${now}`,
          sender: "caller",
          text: transcriptionText,
          timestamp: timeOnly,
          audioDataUri,
        },
      ],
    };

    addServerCallSession(newSession);

    return NextResponse.json({
      success: true,
      session: newSession,
      message: "Cloud Telephony test session intercepted and saved successfully.",
    });
  } catch (err: any) {
    console.error("Test call error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
