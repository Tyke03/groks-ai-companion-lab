const MAX_CHARS = 32000;
const TIMEOUT_MS = 15000;

const decodeEntities = (value: string) => value
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'");

const htmlToMarkdown = (html: string) => {
  let markdown = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => `\n${"#".repeat(Number(level))} ${text}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, " ");
  markdown = decodeEntities(markdown)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  return markdown;
};

type ApiRequest = { method?: string; body?: { url?: unknown } };
type ApiResponse = { status: (code: number) => ApiResponse; json: (body: unknown) => void };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const { url } = req.body || {};
  let parsed: URL;
  try {
    parsed = new URL(String(url || ""));
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only HTTP(S) URLs are supported");
  } catch {
    res.status(400).json({ error: "A valid http:// or https:// URL is required." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "AI-Companion-Hub-DocProxy/1.0",
        Accept: "text/html,text/plain,application/xhtml+xml,*/*",
      },
    });
    if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`);
    const raw = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const text = contentType.includes("html") || /<html[\s>]/i.test(raw) ? htmlToMarkdown(raw) : raw.trim();
    const truncated = text.length > MAX_CHARS;
    res.status(200).json({ text: text.slice(0, MAX_CHARS), truncated, url: parsed.toString() });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "The source took longer than 15 seconds to respond." : error instanceof Error ? error.message : "Unable to fetch the documentation.";
    res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
}
