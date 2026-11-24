import { createHmac, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeHandler } from "../../supabase/functions/ai-seo-crew-blog/handler";

const secret = "test-only-signing-key";
const article = { slug: "a-new-post", title: "A new post", markdown: "Hello **world**.", tags: ["guide", "guide"] };
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
const signed = (payload: object, key = secret) => {
  const raw = JSON.stringify(payload);
  return new Request("https://example.com/webhook", {
    method: "POST", body: raw,
    headers: { "X-Crew-Signature": `sha256=${createHmac("sha256", key).update(raw).digest("hex")}` },
  });
};

describe("AI SEO Crew receiver", () => {
  it("authenticates before processing and acknowledges a signed test without storing it", async () => {
    const save = vi.fn().mockResolvedValue("draft");
    const handler = makeHandler({ secret: () => secret, publish: () => false, save });
    expect((await handler(signed({ test: true }, "wrong"))).status).toBe(401);
    expect(await (await handler(signed({ test: true, article }))).json()).toEqual({ ok: true, test: true });
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects malformed articles and stores valid ones as drafts by default", async () => {
    const save = vi.fn().mockResolvedValue("draft");
    const handler = makeHandler({ secret: () => secret, publish: () => false, save });
    expect((await handler(signed({ article: { ...article, slug: "../invalid" } }))).status).toBe(422);
    expect((await handler(signed({ test: "true", article }))).status).toBe(400);
    expect(await (await handler(signed({ article }))).json()).toEqual({ ok: true, status: "draft" });
    expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ slug: article.slug, tags: ["guide"], status: "draft" }));
  });

  it("returns a live URL only for a published result and rejects legacy slug collisions", async () => {
    const save = vi.fn().mockResolvedValueOnce("published").mockResolvedValueOnce("collision");
    const handler = makeHandler({ secret: () => secret, publish: () => true, save });
    expect(await (await handler(signed({ article }))).json()).toEqual({
      ok: true, url: "https://www.companionhub.app/blog/a-new-post",
    });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: "published" }));
    expect((await handler(signed({ article }))).status).toBe(409);
  });
});
