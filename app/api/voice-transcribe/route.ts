import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { audio, mimeType, apiKey, language } = body;
    const activeApiKey = apiKey || process.env.GEMINI_API_KEY;

    if (!audio) {
      return NextResponse.json(
        { success: false, error: "No audio data provided" },
        { status: 400 }
      );
    }

    // Clean base64 header if present
    const base64Audio = audio.replace(/^data:audio\/[a-zA-Z0-9.-]+;base64,/, "");

    if (activeApiKey) {
      try {
        const langHint = language === "en-IN" ? "Indian English" : "English";
        const prompt = `You are a high-precision Speech-to-Text neural model for an advanced AI desktop assistant named MONDAY.
Your Boss is Nani.
The speaker's language/accent is ${langHint}.
Listen carefully to the audio and transcribe the exact words spoken by the user.
Rules:
1. Return ONLY the transcribed text. Do NOT add any conversational explanation, markdown formatting, quotes, or notes.
2. Accurately transcribe contact names (e.g. Queen, Nani, Boss), phone numbers (e.g. 8074384365), and app names (e.g. WhatsApp, Brave, Chrome, Notepad).
3. If the audio is silent or contains no audible speech, return an empty string.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${activeApiKey}`;

        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType || "audio/webm",
                      data: base64Audio,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 200,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          return NextResponse.json({
            success: true,
            transcript: text,
            model: "gemini-1.5-flash-audio",
          });
        } else {
          const errData = await response.text();
          console.warn("Gemini audio transcription API error:", errData);
        }
      } catch (geminiErr: any) {
        console.warn("Gemini transcription failed:", geminiErr);
      }
    }

    return NextResponse.json({
      success: false,
      transcript: "",
      error: activeApiKey ? "Gemini audio transcription failed" : "No Gemini API key configured",
    });
  } catch (err: any) {
    console.error("Voice transcription route error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
