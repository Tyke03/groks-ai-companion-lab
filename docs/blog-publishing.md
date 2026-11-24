# CompanionHub blog publishing

The hosted site reads published posts from `public.blog_posts`. The migrations create the table and copy the original four articles without changing their URLs. The TypeScript originals remain an offline development fixture and migration input, not a second live editorial source.

## Rollout

1. Apply both blog migrations to project `aqnmlrpltrsrelydipki`, in timestamp order. Check that the four `legacy` rows are published before deploying the website build that reads the table.
2. Deploy the `ai-seo-crew-blog` Edge Function. Supabase JWT verification is disabled for this function alone because the sender uses an HMAC instead. The function refuses all writes without a valid signature.
3. Copy the signing secret from the site's AI SEO Crew webhook configuration to the Supabase function secret `AI_SEO_CREW_SIGNING_SECRET`. Do not add it to GitHub or to any frontend environment variable.
4. Turn off AI SEO Crew Autopilot for the first delivery. Use `https://aqnmlrpltrsrelydipki.supabase.co/functions/v1/ai-seo-crew-blog` as the endpoint and `https://www.companionhub.app/blog` as the blog address. Run the signed connection test. The receiver acknowledges a signed `"test": true` request without writing anything.
5. After the website deployment is verified, send one explicitly approved real article. By default the receiver stores a draft. Review the row in Supabase, then change its `status` to `published` when approved. Check the blog listing, direct URL, and global search. A sender-side status or generated URL alone does not prove an article is public.

## Operating behavior

- Anonymous visitors can read published posts only. The browser cannot insert, edit, or publish posts.
- A repeated delivery with an existing AI SEO Crew slug preserves the first stored version. A slug owned by a migrated article returns a conflict rather than replacing it.
- The optional Edge Function secret `AI_SEO_CREW_PUBLISH_ENABLED=true` enables immediate visibility for new deliveries only. Leave it absent while testing or when Supabase review is required. This is separate from the sender's Autopilot.
- The current website renders article metadata client-side. This integration does not add server-rendered article metadata or automatic sitemap submission.
