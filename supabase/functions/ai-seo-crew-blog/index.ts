import { makeHandler } from "./handler.ts";

Deno.serve(makeHandler({
  secret: () => Deno.env.get("AI_SEO_CREW_SIGNING_SECRET"),
  publish: () => Deno.env.get("AI_SEO_CREW_PUBLISH_ENABLED") === "true",
  save: async (post) => {
    const project = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!project || !key) throw new Error("Database environment missing");
    const base = `${project}/rest/v1/blog_posts`;
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const insert = await fetch(`${base}?on_conflict=slug`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(post),
    });
    if (!insert.ok) throw new Error("Insert failed");
    const params = new URLSearchParams({ slug: `eq.${post.slug}`, select: "source,status" });
    const lookup = await fetch(`${base}?${params}`, { headers });
    if (!lookup.ok) throw new Error("Lookup failed");
    const [stored] = await lookup.json();
    if (!stored) throw new Error("Post not found after delivery");
    if (stored.source !== "ai-seo-crew") return "collision";
    return stored.status === "published" ? "published" : "draft";
  },
}));
