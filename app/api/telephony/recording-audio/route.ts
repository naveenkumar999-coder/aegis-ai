import { NextResponse } from "next/server";

const EXOTEL_KEY = process.env.EXOTEL_API_KEY || "";
const EXOTEL_TOKEN = process.env.EXOTEL_API_TOKEN || "";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const audioUrl = url.searchParams.get("url");

    if (!audioUrl) {
      return new Response("Missing audio url parameter", { status: 400 });
    }

    // Only allow streaming from trusted Exotel or AWS domains
    if (!audioUrl.includes("exotel.com") && !audioUrl.includes("amazonaws.com")) {
      return new Response("Invalid audio domain", { status: 403 });
    }

    const auth = Buffer.from(`${EXOTEL_KEY}:${EXOTEL_TOKEN}`).toString("base64");

    const audioRes = await fetch(audioUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!audioRes.ok) {
      return new Response(`Failed to fetch audio from Exotel: ${audioRes.status}`, {
        status: audioRes.status,
      });
    }

    const contentType = audioRes.headers.get("content-type") || "audio/mpeg";
    const audioBuffer = await audioRes.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err: any) {
    console.error("Audio proxy error:", err);
    return new Response(err.message, { status: 500 });
  }
}
