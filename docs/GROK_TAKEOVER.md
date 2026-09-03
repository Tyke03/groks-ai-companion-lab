# Grok Takeover — AI Companion Hub

**Repo:** `/home/brhub/site_sexychatbots/grok-ai-companion-lab`  
**Remote:** `https://github.com/Tyke03/groks-ai-companion-lab.git`  
**Snapshot audited:** `main` @ `2337145` — "Initial independent snapshot for Grok experiment"  
**Audit date:** 2026-09-03  
**Method:** Static review of this checkout only (no production, no other git remotes, no dashboards, no `.env` files, no credentials).  
**Prior notes:** `docs/site-audit.md` (2026-08-21) is a useful historical finding list. Several P0/P1 items there are already fixed in this snapshot. This document describes **current** code, not that older punch list.

---

## 1. What this application actually does today

This is a **static, client-side catalog and creator-tools SPA** for adult AI companion / roleplay platforms. It does **not** host chatbots, does **not** run inference in the browser, and does **not** transact money. Users browse, filter, and compare third-party platforms; read locally authored setup guides and blog posts; and use browser-side builders that import/export files to disk or `localStorage`.

### Surfaces users can actually use

| Route | What it does | Live vs local |
| --- | --- | --- |
| `/` | Directory of **67** platforms (`src/data/chatbots.ts`) with search, category, content-level, feature, access, and card-spec filters; bookmark via `localStorage`; compare tray (max 5) | Fully local data |
| `/compare` | Shareable side-by-side matrix (`?platforms=slug,slug`) with honest "not a guarantee" disclosure | Fully local |
| `/docs`, `/docs/:slug` | Documentation hub + per-platform guides. **19** guides exist in `src/data/documentation.ts` | Fully local |
| `/tools` | Tabs: Doc Consolidator, Character Card Builder, Prompt Builder | Manual path local; AI path needs Supabase edge function |
| `/tools/lorebook-builder` | World-info editor, import/export SillyTavern v2 / Agnaistic JSON | Local |
| `/tools/persona-builder` | User-persona JSON / text / W++ export | Local |
| `/tools/api-tester` | Browser-direct ping of OpenAI-compatible endpoints (key stays in component memory) | User's endpoint, CORS-limited |
| `/prompts` | Prompt library + local custom templates / favorites | Local |
| `/blog`, `/blog/:id` | Real articles in `src/data/blogPosts.ts` (not placeholders) | Local |
| `/community` | Curated Reddit/Discord/library links; copy-only platform submission; read-only card gallery | Gallery needs Supabase; publishing is **not** implemented |
| `/updates` | Four hardcoded changelog cards in `src/pages/Updates.tsx` | Local, not generated from git |
| `*` | Bare 404 page **outside** `Layout` / age gate | Broken chrome |

### What it does **not** do (despite looking like a product)

- No first-party chatbot, no accounts, no billing, no affiliate checkout.
- Community "Submit a Platform" **does not send mail or write a database** — copy-to-clipboard only, copy says submissions are not open yet (`src/pages/Community.tsx`).
- Community card showcase has **no write/publish path**. The SQL migration (`supabase/migrations/20260819000000_community_cards.sql`) exists; the builder never inserts.
- Character-builder **BYOK / Custom OpenRouter** is an explicit **placeholder** (`src/components/tools/CharacterCardBuilder.tsx`).
- AI generation (card fields, prompt vars, doc consolidation) depends on a remote `venice-ai` edge function. Without public Supabase env + provider keys, those buttons disable and the rest of the site still works.
- URL fetch for the consolidator is implemented twice: Vercel `api/fetch-doc.ts` (15s timeout, HTML to markdown) and `venice-ai` `fetch-url` (no timeout, stale User-Agent). The UI Fetch button is **incorrectly disabled when AI is unavailable**, so the better `/api/fetch-doc` path is blocked whenever the LLM backend is down.

Age gate (`src/components/AgeGate.tsx`) is **self-attestation** via `localStorage.age_verified`. "Under 18 — Leave" hard-redirects to `https://www.google.com`.

---

## 2. How it is structured technically

### Stack

- **Vite 5** + **React 18** + **TypeScript** + **React Router 6** + **Tailwind 3** + **shadcn/ui** (Radix) + **TanStack Query** + **react-helmet-async**.
- Package name is still the Lovable template: `"vite_react_shadcn_ts"` in `package.json`.
- Dev plugin `lovable-tagger` is wired in `vite.config.ts`.
- Data is **compiled into the bundle** from `src/data/*`. There is no CMS.
- Optional backend:
  - `src/integrations/supabase/client.ts` — **lazy/guarded**; `supabase` is `null` and `isSupabaseConfigured` is false when `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are missing or malformed. This is a real fail-safe (older audit UX-001 is already fixed).
  - `supabase/functions/venice-ai/index.ts` — Deno edge function: `health`, `fetch-url`, `consolidate`, `generate-field`, `generate-all`, `convert-character`, `generate-prompt-variable`, `generate-all-prompt-variables`. Tries Venice, then OpenRouter, then Lovable gateway. `health` now returns `ok: false` if no provider key exists (older UX-004 is already fixed).
  - `api/fetch-doc.ts` — Vercel Node handler for URL-to-markdown.
- `vercel.json` is SPA rewrites only (`/(.*) -> /`). `.vercel/` is gitignored; **do not deploy**.

### Key modules worth treating as the real product

- `src/data/chatbots.ts` — `Chatbot` type, 67 records, `platformFilterFacts` map (structured filter evidence; omitted traits never match).
- `src/lib/filters.ts` — single source of truth for directory filtering/counts.
- `src/lib/cardTypes.ts`, `cardCodec.ts`, `cardSchema.ts`, `pngChunk.ts`, `cardTokens.ts` — character-card V1 import / V2 stable export / V3 draft preservation.
- `src/hooks/useAiBackend.ts` — 8s health probe, degrades tools.
- `src/lib/search.ts` — ordered-subsequence matcher for command palette (not cmdk fuzzy rank).
- Tests: Vitest under `src/test/`; Playwright under `e2e/` (desktop 1440 + mobile 375) via `scripts/run-e2e.mjs` which **builds then previews** on `127.0.0.1:8080`.

### Routing (`src/App.tsx`)

`Index`, `Documentation`, `PlatformDocs`, `Tools`, `LorebookBuilder`, `PersonaBuilder`, `ApiTester`, `Compare`, `Updates`, `Prompts`, `Blog`, `BlogPost`, `Community`, `NotFound`.

`Layout` wraps most pages with skip-link, sticky nav (8 items), footer, and age gate. `NotFound` is the exception.

---

## 3. What is good enough to preserve

Do not throw these away in a rewrite:

1. **Honest directory data model** — structured `contentLevel`, capability flags, `lastVerified`, `knownIssues`, and the separate `platformFilterFacts` map that refuses to regex-guess traits (`src/lib/filters.ts` comments and tests in `src/test/filters.test.ts`).
2. **Compare page disclosure** — "guide, not a guarantee"; "Not listed does not mean absent" (`src/pages/Compare.tsx`).
3. **Fail-safe Supabase client + AI health** — site does not white-screen without env; AI buttons disable with a reason (`src/integrations/supabase/client.ts`, `src/hooks/useAiBackend.ts`, tests `src/test/supabase-unconfigured.test.tsx`, `src/test/ai-backend-unavailable.test.tsx`).
4. **Character-card codec** — size limits, V2 as stable target, V3 draft labeled as draft, opaque field preservation (`src/lib/cardTypes.ts`). Tests: `card-codec.test.ts`, `png-chunk.test.ts`, `card-tokens.test.ts`.
5. **Command-palette search semantics** — platforms match **name only**, A-Z, documented in `src/lib/search.ts` + `src/test/global-search-keyboard.test.tsx`.
6. **Skip link, some labels, mobile filter sheet, result counts, clear-all** on the directory (`src/pages/Index.tsx`, `src/components/Layout.tsx`).
7. **Prompt library honesty** — verified vs universal vs user-created lanes, local-only custom templates (`src/pages/Prompts.tsx`, `src/data/promptTemplates.ts`).
8. **Community copy** already admits publishing and email submission are not live.
9. **Content-level disclaimer** on the directory footer and README.
10. **Existing Vitest/Playwright harness** — keep green; they encode product contracts.

---

## 4. What is weak, duplicated, confusing, broken, incomplete, or placeholder-only

### Honesty / branding leftovers

- Product chrome says **AI Companion Hub**; several user-visible strings still say **NSFW AI Chatbot Directory / NSFW AI Insights**:
  - `src/pages/Index.tsx` sr-only span (and `src/test/pages.render.test.tsx` asserts that exact string).
  - `src/pages/Blog.tsx` title plus H1 "NSFW AI Insights"; `src/pages/BlogPost.tsx` title suffix.
  - `src/pages/Documentation.tsx` subtitle "major NSFW AI platforms".
  - `src/pages/Community.tsx` subtitle "NSFW AI chatbot ecosystem".
  - `README.md` H1 still "NSFW AI Chatbot Directory".
  - `index.html` uses `/og-image.png` as the favicon even though `public/favicon.ico` exists.
- `package.json` name is still `vite_react_shadcn_ts` — leftover template identity.
- Homepage hero: "Curated, categorized, and uncensored" (`src/pages/Index.tsx`) overclaims. Content levels 1-5 include SFW/filtered platforms (Character.AI, Mistral Le Chat). The compare page is more honest than the H1.

### Data integrity

- 19 platform guides in `src/data/documentation.ts`: sillytavern, janitor-ai, hammer-ai, risuai, agnaistic, chub-ai, character-ai, novelai, pygmalionai, openrouter, tavernai, spicychat-ai, soulkyn, nectar-ai, kindroid, replika, oobabooga, koboldai, nomi-ai.
- `src/pages/Documentation.tsx` visible heading is dynamic (`Platforms with Full Guides ({documentedPlatforms.length})`) but a hardcoded sr-only still says `(16)`. The render test asserts `"Platforms with Full Guides (16)"` and therefore depends on that lie.
- CrushOn.AI has `docsAvailable: true` in `src/data/chatbots.ts` but no `platformDocs["crushon-ai"]`. `ChatbotCard` already requires both, so the card hides Docs, but the flag is still wrong.
- TavernAI (`slug: tavernai`, `docsAvailable: true`) and TavernAI (legacy) (`slug: tavernai-legacy`, same GitHub URL, `docsAvailable: false`) are two cards for one repo. The legacy copy tries to distinguish the SillyTavern fork lineage, but the directory still looks duplicated.
- Many newer entries (LM Studio, Ollama, Open WebUI, Backyard AI) correctly have `docsAvailable: false`.
- Every `lastVerified` in the snapshot is `2026-08` — a single-month stamp, not ongoing review evidence. Optional evidence metadata on the type is almost unused in records.
- `/updates` is four static blurbs, not derived from data or git.

### Broken or confusing UX

- 404 (`src/pages/NotFound.tsx`): no Layout, no skip-link, full-page home reload, console.error in production, age gate bypass.
- Directory compare tray and `/compare` both exist. The tray still contains a full comparison table (`src/pages/Index.tsx`) and navigates to `/compare?platforms=...`. Dual UX; `/compare` is the better one.
- Desktop nav is 8 items plus search in `hidden sm:flex` (`src/components/Navigation.tsx`) — cramped below 1024px.
- Age-gate Leave goes to Google.
- Character greeting preview still wraps quoted speech in strong tags, not quotes (`renderGreeting` in CharacterCardBuilder).
- Custom OpenRouter generation mode is a no-op placeholder.
- API tester: empty Kobold default URL; browser-direct fetch (CORS).
- Doc Consolidator Fetch disabled when AI is down even though `/api/fetch-doc` does not need the LLM.
- Duplicate `fetch-url` in `venice-ai` (no timeout) vs `api/fetch-doc.ts`.
- `useMemo` used as a side-effect to sync compare URL (`src/pages/Compare.tsx`) — works but is a React anti-pattern.
- Huge unused shadcn surface area under `src/components/ui/` unused by product pages.

### Tests / repo hygiene

- `src/test/example.test.ts` is a tautology.
- Render tests lock in stale branding and the fake "16".
- Dependencies were not installed in this WSL checkout at audit time. Node is present (`v24.14.1`). Tests cannot run until install.
- A documented public-env example file is referenced by ignore rules but was not present. Public variable names only should be documented.

---

## 5. The three highest-leverage product opportunities

1. **Become the honest comparison layer, not a clone of every companion landing page.** Double down on structured facts, last-verified dates, known issues, and "not listed does not mean absent." Users already have 67 marketing sites; they do not have a trustworthy matrix. Kill leftover "uncensored directory" branding. Surface gaps (missing docs, unverified fields) as a feature.
2. **Make creator tools trustworthy without requiring the AI backend.** Card / lorebook / persona / prompt builders already work offline. Treat AI as optional enhancement. Ungate URL fetch. Hide the unused custom-key generation mode until it is real. Ship V2 export as the supported path; keep V3 clearly draft.
3. **A real contribution loop that does not fake a community.** Replace the copy-only submission with an honest, local "propose an edit" artifact (downloadable JSON / markdown issue body) or clearly keep it as "not open." Do not add gallery publishing until there is a maintained backend — a forever-empty gallery is worse than no gallery.

---

## 6. The three highest-leverage technical improvements

1. **Data contracts as tests, not comments.** Assert: unique slugs; every `platformFilterFacts` key exists; `docsAvailable === true` iff `platformDocs[slug]` exists; documented count is never hardcoded; no duplicate URLs without an explicit related-slug. This prevents the CrushOn / "16" class of bugs from returning.
2. **One fetch path, honest AI boundary.** Delete or stop calling `venice-ai` `fetch-url`. Doc Consolidator Fetch uses only `api/fetch-doc.ts` and works when LLM keys are absent. Keep `useAiBackend` strictly for generate/consolidate.
3. **404 + chrome + a11y baseline.** Wrap NotFound in Layout; visible focus on leftover chips; stop using `useMemo` for URL writes; trim nav IA so tools/docs/compare are first-class and the rest nest. Optional later: drop unused Radix primitives to shrink the bundle.

---

## 7. Proposed new product direction (plainly)

**AI Companion Hub is a verification-first directory and local creator workbench for adult roleplay tools — not a chatbot, not a character social network, and not an AI SaaS.**

Keep the catalog, compare matrix, setup guides, and file-based builders. Tell the truth about every field. Treat third-party platforms as reviewed records, not as affiliates. Treat the LLM edge function as an optional writing assistant behind a documented adapter. Do not add payments, accounts, or live chat in this disposable experiment unless a later brief explicitly asks — and even then, mock the boundary first.

Positioning line to aim for: Compare platforms with dated evidence. Build cards and lorebooks on your machine. We do not run the models.

---

## 8. Prioritized implementation plan

### Quick wins (this first batch — no new services)

- Finish the branding pass: Hub name in titles/H1/sr-only/README; keep "NSFW" only where it is a content attribute (levels, gallery rating, platform policy sections), not the product name.
- Remove hardcoded docs count `(16)`; derive from `platformDocs`.
- Set CrushOn.AI `docsAvailable: false` until a guide exists.
- Wrap 404 in `Layout`; client Link home; drop production console.error.
- Point favicon at `public/favicon.ico`.
- Age-gate Leave: on-site blocked message instead of Google.
- Homepage hero: drop "uncensored" as a site-wide claim; point at content-level filtering.
- Ungate Doc Consolidator Fetch from AI-unavailable.
- Soften package name away from the Vite template default.
- Add a public-env example file with public variable names only (no values).
- Update tests so they assert Hub branding and `docsAvailable` consistency with guides.
- Add a data-integrity vitest.

### Foundational refactors (next)

- Deduplicate TavernAI vs tavernai-legacy (one card plus lineage note, or explicit superseded-by).
- Compare: delete the Index drawer table; keep the tray as a jump to `/compare`.
- Replace `useMemo` URL sync with `useEffect`.
- Remove dead `fetch-url` action or give it the same 15s timeout (prefer removal).
- Hide custom-key generation until implemented, or implement a true in-memory OpenRouter path (no logging).
- Token counter: replace the 1.3-times-word heuristic or label it as estimate everywhere (lorebook already discloses).

### Ambitious (only after the above)

- Editorial workflow: evidence metadata required on every record; needs-review badge when `lastVerified` is stale.
- Optional issue-body exporter for platform submissions (still no backend).
- V3 asset round-trip conformance tests against a fixture (e2e already has `e2e/fixtures/v2-card.json`, `v1-card.json`).
- Nav IA: Directory / Compare / Docs / Tools primary; Blog / Prompts / Community / Updates secondary.

### Explicit assumptions

- This checkout is independent; do not pull from any other origin.
- No Vercel/Supabase/Neon deploys, no production hits.
- AI backend will often be unconfigured here; the site must remain useful.
- Adult catalog is in-scope; stay professional; no fake testimonials or fake live AI.

### Risks

- Node 24 may disagree with an older lockfile — prefer the committed lockfile.
- Playwright browsers may be missing; unit tests plus `vite build` are the reliability bar for this batch.
- Changing sr-only / heading strings will fail `pages.render.test.tsx` until tests are updated (they currently encode the bugs).
- Dual compare UIs: changing Index tray behavior could affect the Compare-2 drawer assertions — first batch should not rip the drawer out yet.

### What can be executed without further input

Everything in Quick wins, plus install, unit tests, and production build. No push. No new third-party accounts.

---

## 9. Exact test/build commands found (`package.json` scripts)

From package.json:

- `dev` — vite
- `build` — vite build
- `build:dev` — vite build --mode development
- `lint` — eslint .
- `preview` — vite preview
- `test` — vitest run
- `test:watch` — vitest
- `test:e2e` — node scripts/run-e2e.mjs

Notes:

- Unit/component tests use Vitest, jsdom, include `src/**/*.{test,spec}.{ts,tsx}`, setup `src/test/setup.ts`.
- Production build is Vite only; there is no project-wide `tsc -b` gate.
- E2E builds, starts vite preview on 127.0.0.1 port 8080 with strictPort, then Playwright for chromium-desktop and chromium-mobile.
- Dev server is Vite port 8080 (`vite.config.ts`).

README omits `test:e2e` and `test:watch`; this file is the accurate list.

---

## 10. Changelog

### 2026-09-03 — Audit (this document)

- Wrote `docs/GROK_TAKEOVER.md` against `main` @ `2337145`.
- Confirmed older `docs/site-audit.md` P0 (unguarded Supabase) and P1 (health false-positive, dead mailto) are already addressed in this snapshot; remaining work is honesty, data contracts, 404, fetch gating, placeholders.

### 2026-09-03 — First batch

_To be appended after the batch lands._
