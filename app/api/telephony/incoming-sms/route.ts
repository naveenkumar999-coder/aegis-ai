import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SMS_LOG_FILE = path.join(process.cwd(), "data", "incoming_sms.json");

export async function GET(req: Request) {
  return handleSms(req);
}

export async function POST(req: Request) {
  return handleSms(req);
}

async function handleSms(req: Request) {
  try {
    const url = new URL(req.url);
    let from = url.searchParams.get("From") || "";
    let to = url.searchParams.get("To") || "";
    let body = url.searchParams.get("Body") || "";
    let smsSid = url.searchParams.get("SmsSid") || "";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      try {
        const formData = await req.clone().formData();
        from = (formData.get("From") || from).toString();
        to = (formData.get("To") || to).toString();
        body = (formData.get("Body") || body).toString();
        smsSid = (formData.get("SmsSid") || smsSid).toString();
      } catch {}
    } else if (contentType.includes("application/json")) {
      try {
        const json = await req.clone().json();
        from = json.From || from;
        to = json.To || to;
        body = json.Body || body;
        smsSid = json.SmsSid || smsSid;
      } catch {}
    }

    console.log(`[INCOMING SMS] From: ${from} | To: ${to} | Body: ${body}`);

    // Persist SMS
    const record = {
      id: smsSid || `sms-${Date.now()}`,
      from,
      to,
      body,
      receivedAt: new Date().toISOString()
    };

    try {
      const dir = path.dirname(SMS_LOG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let current: any[] = [];
      if (fs.existsSync(SMS_LOG_FILE)) {
        try {
          current = JSON.parse(fs.readFileSync(SMS_LOG_FILE, "utf-8")) || [];
        } catch {}
      }
      current.unshift(record);
      fs.writeFileSync(SMS_LOG_FILE, JSON.stringify(current.slice(0, 50), null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write SMS log:", err);
    }

    return new NextResponse("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  } catch (error) {
    console.error("Error in incoming-sms:", error);
    return new NextResponse("Error", { status: 500 });
  }
}
