import { NextResponse } from "next/server";

export async function GET(req: Request) {
  return handleNewsRequest(req);
}

export async function POST(req: Request) {
  return handleNewsRequest(req);
}

async function handleNewsRequest(req: Request) {
  try {
    let topic = "World";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.topic || body.query) {
        topic = body.topic || body.query;
      }
    } else {
      const url = new URL(req.url);
      const queryTopic = url.searchParams.get("q") || url.searchParams.get("topic");
      if (queryTopic) {
        topic = queryTopic;
      }
    }

    const cleanTopic = topic
      .replace(/can|you|show|me|the|news|latest|update|updates|about|tell|give|what|is/gi, "")
      .replace(/[?.,!]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const displayTopic = cleanTopic.length > 1 ? cleanTopic : "Top Stories";
    const rssUrl = cleanTopic.length > 1
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(cleanTopic)}&hl=en-US&gl=US&ceid=US:en`
      : `https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 120 },
    });

    if (!res.ok) {
      throw new Error(`Google News RSS HTTP status ${res.status}`);
    }

    const xmlText = await res.text();

    const items: Array<{ title: string; link: string; pubDate: string; source: string }> = [];
    const itemBlockRegex = /<item[\s\S]*?>([\s\S]*?)<\/item>/gi;

    let match: RegExpExecArray | null;
    while ((match = itemBlockRegex.exec(xmlText)) !== null && items.length < 5) {
      const content = match[1];

      const titleMatch = content.match(/<title[\s\S]*?>([\s\S]*?)<\/title>/i);
      const linkMatch = content.match(/<link[\s\S]*?>([\s\S]*?)<\/link>/i);
      const pubDateMatch = content.match(/<pubDate[\s\S]*?>([\s\S]*?)<\/pubDate>/i);
      const sourceMatch = content.match(/<source[\s\S]*?>([\s\S]*?)<\/source>/i);

      if (titleMatch && titleMatch[1]) {
        let title = titleMatch[1]
          .replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1")
          .replace(/<[^>]+>/g, "")
          .trim();
        title = title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

        let link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1").trim() : "https://news.google.com";
        let pubDate = pubDateMatch ? pubDateMatch[1].trim() : new Date().toUTCString();
        let source = sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1").trim() : "Google News";

        if (title) {
          items.push({ title, link, pubDate, source });
        }
      }
    }

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        topic: displayTopic,
        message: `📰 LIVE REAL-TIME NEWS:\nNo articles found for '${displayTopic}'. Please check search query.`,
        articles: [],
      });
    }

    const formattedNews = items
      .map((item) => `• ${item.title} [Source: ${item.source}]`)
      .join("\n\n");

    return NextResponse.json({
      success: true,
      topic: displayTopic,
      message: `📰 LIVE REAL-TIME NEWS UPDATES (${displayTopic.toUpperCase()}):\n\n${formattedNews}`,
      articles: items,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: `Live News Error: ${err.message}`,
      message: "Could not fetch live internet news at the moment.",
    }, { status: 500 });
  }
}
