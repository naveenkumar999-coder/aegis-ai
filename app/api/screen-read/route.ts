import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  let tempFilePath = "";
  try {
    const body = await req.json();
    const { image, prompt, apiKey } = body;
    const activeApiKey = apiKey || process.env.GEMINI_API_KEY;

    if (!image) {
      return NextResponse.json({
        success: false,
        needClientCapture: true,
        response: "Boss! Please grant screen capture permission in your browser or click 'READ SCREEN' so MONDAY can read the live text directly from your display.",
      });
    }

    // 1. Convert base64 data to buffer and save to temporary file
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    const tempFileName = `monday_screen_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
    tempFilePath = path.join(os.tmpdir(), tempFileName);
    await fs.writeFile(tempFilePath, imageBuffer);

    // 2. Invoke Windows Native WinRT OCR via lib/screen_ocr.ps1
    const scriptPath = path.join(process.cwd(), "lib", "screen_ocr.ps1").replace(/\\/g, "/");
    const ocrCmd = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -ImagePath "${tempFilePath.replace(/\\/g, "/")}"`;

    let ocrText = "";
    let ocrLines: string[] = [];

    try {
      const { stdout } = await execAsync(ocrCmd);
      const trimmed = stdout.trim();
      if (trimmed.startsWith("{")) {
        const parsed = JSON.parse(trimmed);
        if (parsed.success) {
          ocrText = (parsed.text || "").trim();
          ocrLines = Array.isArray(parsed.lines) ? parsed.lines : [];
        }
      } else {
        ocrText = trimmed;
      }
    } catch (ocrErr) {
      console.warn("WinRT OCR execution warning:", ocrErr);
    }

    // Clean up temp file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        tempFilePath = "";
      } catch {}
    }

    // 3. If Gemini API key is available, use Gemini 1.5 Flash Vision / Reasoning
    if (activeApiKey && ocrText.length > 0) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${activeApiKey}`;
        const userPrompt = `You are MONDAY, personal AI for Boss Nani.
The user asked: "${prompt || "Read out the screen displaying texts live"}".
Here is the raw OCR text extracted directly from Boss Nani's live screen:
---
${ocrText.slice(0, 3000)}
---
Instructions:
1. Summarize and read out the most important content/results currently visible on screen in crisp, clear, natural spoken language.
2. Address Nani as "Boss". Include exactly one "Boss!" token.
3. Keep it crisp, structured, and easy to listen to.`;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              maxOutputTokens: 300,
              temperature: 0.4,
            },
          }),
        });

        if (geminiRes.ok) {
          const gData = await geminiRes.json();
          const candidateText = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (candidateText) {
            return NextResponse.json({
              success: true,
              response: candidateText,
              rawOcr: ocrText,
              lines: ocrLines,
            });
          }
        }
      } catch (geminiErr) {
        console.warn("Gemini vision analysis failed, using native OCR output:", geminiErr);
      }
    }

    // 4. Format Native OCR Response
    if (ocrText.length > 0) {
      // Filter out single punctuation marks or tiny artifacts
      const cleanedLines = ocrLines
        .map((l) => l.trim())
        .filter((l) => l.length > 1 && !/^[\s\-–—|_=.:;]+$/.test(l));

      const formattedSample = cleanedLines.slice(0, 15).join("\n• ");

      const responseMessage = `Here is the live text currently displayed on your screen, Boss:\n• ${formattedSample}\n\nAll visible text blocks and interface elements have been synthesized from your display!`;

      return NextResponse.json({
        success: true,
        response: responseMessage,
        rawOcr: ocrText,
        lines: cleanedLines,
      });
    } else {
      return NextResponse.json({
        success: true,
        response: "I scanned your screen, Boss! No clear textual elements were detected in the active display area. Standing by for your directive!",
        rawOcr: "",
        lines: [],
      });
    }
  } catch (error: any) {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch {}
    }
    console.error("Screen read route error:", error);
    return NextResponse.json({
      success: false,
      response: `Screen scan encountered an interruption: ${error.message}, Boss!`,
      error: error.message,
    });
  }
}
