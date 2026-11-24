export type IncomingPost = {
  slug: string;
  title: string;
  excerpt: string;
  read_time: string;
  tags: string[];
  markdown: string | null;
  html: string | null;
  meta_title: string | null;
  meta_description: string | null;
  image_url: string | null;
  source: "ai-seo-crew";
  status: "draft" | "published";
};

type Dependencies = {
  secret: () => string | undefined;
  publish: () => boolean;
  save: (post: IncomingPost) => Promise<"draft" | "published" | "collision">;
};

const MAX_BODY = 1_000_000;
const encoder = new TextEncoder();
const respond = (status: number, body: Record<string, unknown>) => Response.json(body, { status });
const field = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

function httpsImage(value: unknown) {
  const url = field(object(value)?.url ?? object(value)?.src ?? value, 4096);
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function makeHandler({ secret, publish, save }: Dependencies) {
  return async (request: Request) => {
    if (request.method !== "POST") return respond(405, { error: "POST required" });
    const signingSecret = secret();
    if (!signingSecret) return respond(503, { error: "Webhook not configured" });
    const signature = /^sha256=([a-f0-9]{64})$/i.exec(request.headers.get("X-Crew-Signature") ?? "");
    if (!signature) return respond(401, { error: "Invalid signature" });
    if (Number(request.headers.get("content-length")) > MAX_BODY) {
      return respond(413, { error: "Payload too large" });
    }
    try {
      const bytes = await readBody(request);
      if (!bytes) return respond(413, { error: "Payload too large" });
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
      );
      const mac = Uint8Array.from(signature[1].match(/../g)!, (pair) => parseInt(pair, 16));
      if (!await crypto.subtle.verify("HMAC", key, mac, bytes)) {
        return respond(401, { error: "Invalid signature" });
      }
      let payload: Record<string, unknown> | undefined;
      try {
        payload = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      } catch {
        return respond(400, { error: "Invalid JSON" });
      }
      if (payload?.test === true) return respond(200, { ok: true, test: true });
      if (payload?.test !== undefined && payload.test !== false) {
        return respond(400, { error: "Invalid test marker" });
      }
      const article = object(payload?.article);
      if (!article) return respond(422, { error: "Article required" });
      const slug = field(article.slug, 161);
      const title = field(article.title, 300);
      const markdown = field(article.markdown, MAX_BODY);
      const html = field(article.html, MAX_BODY);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 160 || !title || !(markdown || html)) {
        return respond(422, { error: "Valid slug, title and article body required" });
      }
      const tags = Array.isArray(article.tags)
        ? [...new Set(article.tags.map((tag) => field(tag, 60)).filter(Boolean))].slice(0, 25)
        : [];
      const text = markdown || html.replace(/<[^>]*>/g, " ");
      const result = await save({
        slug, title, tags,
        excerpt: field(article.excerpt, 600) || field(article.metaDescription, 600),
        read_time: `${Math.max(1, Math.ceil(text.split(/\s+/).length / 220))} min`,
        markdown: markdown || null,
        html: html || null,
        meta_title: field(article.metaTitle, 300) || null,
        meta_description: field(article.metaDescription, 600) || null,
        image_url: httpsImage(article.image),
        source: "ai-seo-crew",
        status: publish() ? "published" : "draft",
      });
      if (result === "collision") return respond(409, { error: "Slug already belongs to an existing article" });
      return respond(200, result === "published"
        ? { ok: true, url: `https://www.companionhub.app/blog/${slug}` }
        : { ok: true, status: "draft" });
    } catch {
      return respond(500, { error: "Could not receive article" });
    }
  };
}
