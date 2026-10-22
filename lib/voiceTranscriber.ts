const EXOTEL_KEY = process.env.EXOTEL_API_KEY || "";
const EXOTEL_TOKEN = process.env.EXOTEL_API_TOKEN || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

const transcriptCache = new Map<string, string>();

export async function transcribeRecordingUrl(recordingUrl: string): Promise<string> {
  if (!recordingUrl) return "";
  if (transcriptCache.has(recordingUrl)) {
    return transcriptCache.get(recordingUrl)!;
  }

  try {
    const exotelAuth = Buffer.from(`${EXOTEL_KEY}:${EXOTEL_TOKEN}`).toString("base64");
    const audioRes = await fetch(recordingUrl, {
      headers: { Authorization: `Basic ${exotelAuth}` },
    });
    if (!audioRes.ok) return "";

    const audioBuffer = await audioRes.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");

    const prompt =
      "Transcribe what is spoken in this phone audio recording. Return ONLY the transcribed text. Do not add quotes, introductory remarks, or markdown formatting. If silent, return empty.";

    // Try gemini-3.5-flash first, fallback to gemini-3.1-flash-lite
    for (const model of ["models/gemini-3.5-flash", "models/gemini-3.1-flash-lite"]) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${GEMINI_KEY}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inlineData: { mimeType: "audio/mp3", data: base64Audio } },
                  { text: prompt },
                ],
              },
            ],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          if (text) {
            transcriptCache.set(recordingUrl, text);
            return text;
          }
        }
      } catch {}
    }

    return "";
  } catch (err) {
    console.warn("Failed to transcribe recording:", err);
    return "";
  }
}
