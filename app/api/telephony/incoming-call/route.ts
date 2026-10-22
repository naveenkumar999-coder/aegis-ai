import { NextResponse } from "next/server";
import { addServerCallSession } from "@/lib/serverCallSessions";

export async function POST(req: Request) {
  try {
    // Exact greeting required by Section 4
    const greetingText =
      "Hello, I am AEGIS, Naveen's personal AI assistant. He is currently unavailable. Please leave your name and message after the beep.";

    // Exact confirmation required by Section 4
    const confirmationText =
      "Thank you. Your message has been received. Goodbye.";

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const baseUrl = process.env.AEGIS_WEBHOOK_URL
      ? process.env.AEGIS_WEBHOOK_URL.replace(/\/$/, "")
      : `${proto}://${host}`;
    const callbackUrl = `${baseUrl}/api/telephony/recording-callback`;

    let fromNumber = "Unknown Caller";
    let callSid = "";

    try {
      const url = new URL(req.url);
      if (url.searchParams.get("From") || url.searchParams.get("Caller") || url.searchParams.get("CallFrom")) {
        fromNumber = url.searchParams.get("From") || url.searchParams.get("Caller") || url.searchParams.get("CallFrom") || "Unknown Caller";
      }
      if (url.searchParams.get("CallSid") || url.searchParams.get("call_sid")) {
        callSid = url.searchParams.get("CallSid") || url.searchParams.get("call_sid") || "";
      }

      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await req.clone().formData();
        fromNumber = (formData.get("From") || formData.get("Caller") || formData.get("CallFrom") || fromNumber).toString();
        callSid = (formData.get("CallSid") || formData.get("call_sid") || callSid).toString();
      } else if (contentType.includes("application/json")) {
        const json = await req.clone().json();
        fromNumber = json.From || json.Caller || json.CallFrom || fromNumber;
        callSid = json.CallSid || json.call_sid || callSid;
      }
    } catch {}

    if (fromNumber && fromNumber !== "Unknown Caller") {
      const now = Date.now();
      const uniqueKey = callSid || `${now}`;
      const sessionId = `call-${uniqueKey}`;
      const timeStr = "Today, " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const timeOnly = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const colors = ["#25D366", "#00A884", "#128C7E", "#34B7F1", "#075E54"];
      const avatarColor = colors[Math.abs(fromNumber.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colors.length];

      await addServerCallSession({
        id: sessionId,
        callerName: fromNumber,
        callerNumber: fromNumber,
        avatarColor,
        timestamp: timeStr,
        duration: "Active",
        unread: true,
        urgency: "normal",
        status: "ongoing",
        summary: "AEGIS AI is answering incoming call...",
        messages: [
          {
            id: `msg-welcome-${now}`,
            sender: "aegis",
            text: greetingText,
            timestamp: timeOnly,
            status: "delivered",
          },
        ],
      });
    }

    // Standard Provider-Specific Voice XML (TwiML / Voice XML)
    // Uses clear, natural TTS voice (Polly.Brian / en-GB for British Jarvis style, compatible with all providers)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Brian" language="en-GB">${greetingText}</Say>
    <Record 
        action="${callbackUrl}" 
        method="POST" 
        maxLength="60" 
        finishOnKey="#" 
        playBeep="true" 
        trim="trim-silence"
        transcribe="true"
        transcribeCallback="${callbackUrl}"
    />
    <Say voice="Polly.Brian" language="en-GB">${confirmationText}</Say>
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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const fromNumber =
      searchParams.get("CallFrom") ||
      searchParams.get("From") ||
      searchParams.get("Caller") ||
      "Unknown Caller";

    const callSid =
      searchParams.get("CallSid") ||
      searchParams.get("call_sid") ||
      `call-${Date.now()}`;

    const toNumber =
      searchParams.get("CallTo") ||
      searchParams.get("To") ||
      "";

    console.log(`[EXOTEL PASSTHRU WEBHOOK] Call from: ${fromNumber} | To: ${toNumber} | Sid: ${callSid}`);

    if (fromNumber && fromNumber !== "Unknown Caller") {
      const now = Date.now();
      const sessionId = `call-${callSid}`;
      const timeStr = "Today, " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const timeOnly = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const colors = ["#25D366", "#00A884", "#128C7E", "#34B7F1", "#075E54"];
      const avatarColor = colors[Math.abs(fromNumber.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colors.length];

      await addServerCallSession({
        id: sessionId,
        callerName: fromNumber,
        callerNumber: fromNumber,
        avatarColor,
        timestamp: timeStr,
        duration: "Active",
        unread: true,
        urgency: "normal",
        status: "ongoing",
        summary: "AEGIS received call via Exotel Passthru...",
        messages: [
          {
            id: `msg-welcome-${now}`,
            sender: "aegis",
            text: "Hello, I am AEGIS, Naveen's personal AI assistant. He is currently unavailable. Please leave your name and message after the beep.",
            timestamp: timeOnly,
            status: "delivered",
          },
        ],
      });
    }

    return new NextResponse("OK", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("Error in Exotel Passthru GET handler:", err);
    return new NextResponse("OK", { status: 200 });
  }
}

