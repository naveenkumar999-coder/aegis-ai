/**
 * Live Internet Web Search & Knowledge Synthesis Engine for MONDAY AI
 * Provides real-time internet access to answer any user question
 * using live web search snippets, Wikipedia summaries, and web intelligence.
 */

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Searches the live web using DuckDuckGo HTML search and returns top snippets.
 */
async function searchDuckDuckGo(query: string): Promise<string[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const snippets: string[] = [];
      const regex = /<a[^>]+class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(html)) !== null && snippets.length < 3) {
        const text = decodeHtmlEntities(match[1]);
        if (text && text.length > 20) {
          snippets.push(text);
        }
      }
      return snippets;
    }
  } catch (err: any) {
    console.warn("DuckDuckGo live search error:", err?.message || err);
  }
  return [];
}

/**
 * Searches Wikipedia and returns the summary extract of the most relevant page.
 */
async function searchWikipedia(query: string): Promise<string | null> {
  try {
    const cleanTopic = query
      .replace(
        /^(?:what\s+(?:is|do\s+you\s+know\s+about|can\s+you\s+tell\s+me\s+about|are)|tell\s+me\s+about|who\s+is|who\s+was|explain|describe)\s+/i,
        ""
      )
      .replace(
        /\s+(?:and\s+what\s+is\s+it\s+mainly\s+designed\s+for|mainly\s+designed\s+for|used\s+for|for)\b.*$/i,
        ""
      )
      .replace(/[?.,!]/g, "")
      .trim();

    if (!cleanTopic) return null;

    const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      cleanTopic
    )}&utf8=&format=json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(wikiSearchUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "MondayAI/1.0 (monday@ultron.ai)" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const results = data.query?.search || [];

      for (const item of results) {
        if (!item.title.toLowerCase().includes("disambiguation")) {
          const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            item.title
          )}`;
          const sumRes = await fetch(sumUrl, {
            headers: { "User-Agent": "MondayAI/1.0" },
          });
          if (sumRes.ok) {
            const sumData = await sumRes.json();
            if (sumData.extract && !sumData.extract.includes("may refer to:")) {
              return sumData.extract;
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("Wikipedia live API error:", err?.message || err);
  }
  return null;
}

/**
 * Free AI Neural Web Knowledge Endpoint (Zero Key Required)
 */
async function queryFreeAi(query: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const systemPrompt =
      "You are MONDAY, an advanced cybernetic AI assistant. Answer the user question concisely, factually and directly in 2 to 3 sentences. Address the user as Boss Nani or Boss.";
    const fullPrompt = `${systemPrompt}\n\nUser Question: ${query}`;
    const url = `https://text.pollinations.ai/${encodeURIComponent(
      fullPrompt
    )}?model=openai`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MondayAI/1.0" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const text = (await res.text()).trim();
      if (
        text &&
        !text.includes("Rate limit") &&
        !text.includes("error") &&
        text.length > 20
      ) {
        return text;
      }
    }
  } catch (err: any) {
    console.warn("Free AI web endpoint error:", err?.message || err);
  }
  return null;
}

function formatSingleBoss(text: string): string {
  let t = text.replace(/\s*,\s*Boss!*/gi, "").replace(/\bBoss\s+Nani\b/gi, "").replace(/\bBoss!*/gi, "").trim();
  t = t.replace(/\s+/g, " ").replace(/[.,;:!\s]+$/, "");
  return `${t}, Boss!`;
}

/**
 * Master Internet Search & Question Answering Function
 * Combines live web search snippets, Wikipedia facts, and AI synthesis.
 */
export async function answerViaLiveInternet(query: string): Promise<string> {
  // 1. Try Free AI Knowledge Synthesis
  const aiAnswer = await queryFreeAi(query);
  if (aiAnswer) {
    return formatSingleBoss(aiAnswer);
  }

  // 2. Try DuckDuckGo Live Web Search
  const snippets = await searchDuckDuckGo(query);
  if (snippets.length > 0) {
    const combined = snippets.slice(0, 2).join(" ");
    return formatSingleBoss(`Based on live internet search: ${combined}`);
  }

  // 3. Try Wikipedia Live Knowledge
  const wikiAnswer = await searchWikipedia(query);
  if (wikiAnswer) {
    return formatSingleBoss(`According to live web records: ${wikiAnswer}`);
  }

  return `I processed your inquiry "${query}", Boss! Live search data is currently offline or unreachable.`;
}
