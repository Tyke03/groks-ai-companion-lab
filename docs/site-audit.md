# AI Companion Hub — Product & UX Implementation Audit

**Date:** 2026-08-21
**Scope:** Full repository (`src/`, `api/`, `supabase/`, `index.html`, `vercel.json`, `package.json`) and the deployed production site (`ai-companion-hub2.vercel.app`).
**Method:** Static code review of routes, components, data models, Supabase wiring, and edge/serverless functions; plus HTTP inspection of the production deployment. This environment has no browser renderer, so visual/pixel-level checks (exact contrast ratios, rendered layouts at 375/768/1440px) are inferred from Tailwind breakpoints and CSS, not screenshots.

**Stack summary:** React 18 + Vite 5 + React Router 6 + Tailwind 3 + shadcn/ui + Supabase (`@supabase/supabase-js` 2.95). Backends: one Supabase Edge Function (`venice-ai`) and one Vercel Node function (`api/fetch-doc`). Data is fully client-side/static in `src/data/` (no CMS); the only dynamic storage is Supabase `community_cards` (read-only from the app today) and `localStorage`.

---

## Executive summary

The upgrade is substantially complete: 67 platform records, six-category taxonomy, multi-attribute filtering, `/compare`, three dedicated creator tools, expanded docs, `/prompts`, `/updates`, and a Supabase gallery schema all exist and the production build is live and serving correct branding on `/`. The remaining issues are **not** broad breakage; they are:

1. **A hard, unguarded runtime dependency on Supabase env vars** that can white-screen the whole app (P0 risk).
2. **Two community features that look live but are non-functional** — the platform submission email is a `.example` placeholder, and the community card showcase has no write/publish path (so it can only ever render empty).
3. **An unreliable AI-availability signal** — the health check reports "available" even when no LLM keys are configured.
4. **A batch of data-integrity and consistency bugs** (stale counts, stale branding, a `docsAvailable:true` record with no guide, duplicate TavernAI entries).
5. **Polish/accessibility gaps** (focus visibility, missing labels, no empty/loading/error differentiation, a no-op "BYOK" generation mode, non-conformant V3 asset output, CORS-prone API tester).

No finding below is implemented; this document is analysis only.

---

## Findings

### A. Supabase, environment, and API plumbing

#### UX-001 — Unguarded Supabase client can crash the entire app
- **Severity:** P0 (latent blocking — currently masked because env vars are configured)
- **User-visible problem:** `src/integrations/supabase/client.ts` calls `createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)` at module scope with no guard. supabase-js throws at construction when the URL is missing. The client is imported transitively by the main bundle (App → Tools → CharacterCardBuilder/PromptBuilder/DocConsolidator → `useAiBackend`), so if `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is ever missing on the Vercel environment, the **entire site white-screens**, not just the Supabase-dependent pages.
- **Files:** `src/integrations/supabase/client.ts` (lines 5–11), `src/hooks/useAiBackend.ts`.
- **Recommended fix:** Lazily construct the client (or return a stub) and expose an `isSupabaseConfigured` flag; have `useAiBackend` and `Community` degrade to "unavailable/read-only" instead of throwing. Add `.env.example` documenting the two required vars (currently absent — `.gitignore` references `!.env.example` but no such file exists).
- **Acceptance test:** With `VITE_SUPABASE_URL` unset, `npm run build` + preview renders the directory and tools without a runtime exception, and AI/gallery surfaces show the "unavailable" state.
- **Supabase impact:** read (functions.invoke, select)
- **Estimated scope:** S

#### UX-002 — Community "Submit a Platform" emails a placeholder domain
- **Severity:** P1
- **User-visible problem:** "Compose Submission Email" builds a `mailto:` to `submit@nsfw-ai-directory.example` — a reserved `.example` domain that can never receive mail. The primary submission flow is dead; only the "Copy Summary" fallback actually works.
- **File:** `src/pages/Community.tsx` (line 11: `SUBMIT_EMAIL`).
- **Recommended fix:** Point to a real inbox or a hosted form (e.g., a Supabase table/edge function or a form service), or replace the email CTA with the copy-to-clipboard flow as the primary action.
- **Acceptance test:** Clicking the button produces a deliverable submission (verified by a real inbox/form), or the dead email CTA is removed in favor of copy.
- **Supabase impact:** none today (write if replaced with a table/function)
- **Estimated scope:** S

#### UX-003 — Community card showcase has no write/publish path
- **Severity:** P1
- **User-visible problem:** The migration defines an insert policy for authenticated users, but the frontend has **no** auth flow, no share/publish button in the CharacterCardBuilder, and no `.insert()` call anywhere. "Open in Card Builder →" is a plain `<a href="/tools">` that does not load the card's JSON. The gallery therefore renders its empty state forever; the page text ("share it when publishing is enabled") confirms publishing is not implemented.
- **Files:** `supabase/migrations/20260819000000_community_cards.sql` (lines 13–14), `src/pages/Community.tsx` (line 144), `src/components/tools/CharacterCardBuilder.tsx`.
- **Recommended fix:** Implement the share path: anonymous or Supabase-auth publish from the builder (`supabase.from("community_cards").insert(...)` with matching `user_id`/RLS), then deep-link the gallery card back into the builder with the `card_json` payload.
- **Acceptance test:** Creating a card in the builder and clicking "Share" inserts a row that appears in `/community`; the gallery card's "Open in Card Builder" loads that card into the builder.
- **Supabase impact:** write (insert) + auth
- **Estimated scope:** M

#### UX-004 — AI health check is a false positive
- **Severity:** P1
- **User-visible problem:** `venice-ai`'s `health` action returns `{ok:true}` unconditionally, even when none of `VENICE_API_KEY`/`OPENROUTER_API_KEY`/`LOVABLE_API_KEY` are set. `useAiBackend` therefore reports "available", enables all AI buttons, and users hit "No API keys configured" only after clicking.
- **Files:** `supabase/functions/venice-ai/index.ts` (health branch), `src/hooks/useAiBackend.ts`.
- **Recommended fix:** Have `health` verify that at least one provider key is configured (or probe a provider) and return `ok` only then.
- **Acceptance test:** With no keys configured, AI buttons show disabled + "backend unavailable" on load; with a key, they enable.
- **Supabase impact:** read (functions.invoke health)
- **Estimated scope:** S

#### UX-005 — URL Fetch is disabled when only the AI backend is down
- **Severity:** P2
- **User-visible problem:** The Doc Consolidator's "Fetch" button is disabled by `aiUnavailable`, but URL fetching uses the Vercel `/api/fetch-doc` function and does **not** need the AI backend. The banner text ("URL fetching and consolidation require the AI backend") is also wrong — only consolidation requires AI.
- **Files:** `src/components/tools/DocConsolidator.tsx` (Fetch button `disabled={fetching || aiUnavailable}`, banner copy).
- **Recommended fix:** Remove `aiUnavailable` from the Fetch button's disabled state and correct the banner copy.
- **Acceptance test:** With the AI backend down, pasting a URL and clicking Fetch still populates the textarea.
- **Supabase impact:** none (uses `/api/fetch-doc`)
- **Estimated scope:** XS

#### UX-006 — Duplicate URL-fetch implementations (one timeout-less)
- **Severity:** P2
- **User-visible problem:** Two fetch paths exist: `/api/fetch-doc` (15s timeout, markdown extraction — used by the UI) and the `venice-ai` `fetch-url` action (plain `fetch`, **no** timeout, no redirect/size guard). The edge action is dead code that could still be invoked and hang.
- **Files:** `api/fetch-doc.ts`, `supabase/functions/venice-ai/index.ts` (`fetch-url` branch).
- **Recommended fix:** Delete the edge `fetch-url` action (or add the same timeout/limits) and standardize on `/api/fetch-doc`.
- **Acceptance test:** A grep shows a single fetch implementation; a slow URL aborts at 15s.
- **Supabase impact:** none (after removal)
- **Estimated scope:** XS

#### UX-007 — Community gallery has no loading or error state
- **Severity:** P2
- **User-visible problem:** The gallery `.then(({data}) => …, () => setGalleryCards([]))` swallows errors and falls through to the "No shared cards yet" empty state. A Supabase outage is indistinguishable from a genuinely empty table.
- **File:** `src/pages/Community.tsx` (lines 25–29, 144).
- **Recommended fix:** Add `loading` / `error` states and render distinct messaging for each.
- **Acceptance test:** With the Supabase URL pointing at an unreachable host, the page shows an error state (not "No shared cards yet").
- **Supabase impact:** read (select)
- **Estimated scope:** S

---

### B. Branding and hardcoded copy/counts

#### UX-008 — Stale "NSFW AI Chatbot Directory / NSFW AI" branding remains
- **Severity:** P2
- **User-visible problem:** Multiple surfaces still carry the pre-rebrand name, so shared/social titles and screen-reader text are inconsistent with "AI Companion Hub":
  - `src/pages/Index.tsx` line 147 — `<span className="sr-only">NSFW AI Chatbot Directory</span>`.
  - `README.md` line 1 — `# NSFW AI Chatbot Directory`.
  - `src/pages/Blog.tsx` / `BlogPost.tsx` — `<title>… — NSFW AI Insights</title>` and `<h1>NSFW AI Insights</h1>`.
  - `src/pages/Documentation.tsx` — subtitle "…troubleshooting for major NSFW AI platforms".
  - `src/pages/Community.tsx` — subtitle "…community hubs for the NSFW AI chatbot ecosystem".
  - `supabase/functions/venice-ai/index.ts` — User-Agent `+https://nsfw-ai-directory.local`.
- **Recommended fix:** Replace all of the above with "AI Companion Hub" (or neutral "AI companion/roleplay" phrasing where "NSFW" is descriptive rather than a name).
- **Acceptance test:** A repo-wide search for `NSFW AI Chatbot Directory` and `NSFW AI Insights` returns no matches in user-visible strings; README title updated.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-009 — Hardcoded "16 guides" count contradicts the real 19
- **Severity:** P2
- **User-visible problem:** `Documentation.tsx` renders an `sr-only` span hardcoding `(16)` while the visible heading interpolates the true count (19). Screen-reader users hear a wrong number, and the test suite (`pages.render.test.tsx` line 117) locks in the stale value.
- **Files:** `src/pages/Documentation.tsx` (line 34), `src/test/pages.render.test.tsx`.
- **Recommended fix:** Delete the hardcoded `sr-only` span (the visible heading already carries the dynamic count) and update the test.
- **Acceptance test:** `/docs` announces "Platforms with Full Guides (19)"; the test asserts the dynamic value.
- **Supabase impact:** none
- **Estimated scope:** XS

#### UX-010 — Test suite asserts stale branding/count
- **Severity:** P2
- **User-visible problem:** `pages.render.test.tsx` asserts `getByText("NSFW AI Chatbot Directory")` and `getByText("Platforms with Full Guides (16)")`, effectively freezing the outdated values in CI.
- **File:** `src/test/pages.render.test.tsx` (lines 51, 117).
- **Recommended fix:** Update assertions to the rebranded title and dynamic/real count.
- **Acceptance test:** Tests pass against the corrected copy.
- **Supabase impact:** none
- **Estimated scope:** XS

---

### C. Platform data schema and hardcoded lists/counts

#### UX-011 — `docsAvailable:true` with no guide (CrushOn.AI)
- **Severity:** P2
- **User-visible problem:** `CrushOn.AI` (`crushon-ai`) declares `docsAvailable: true`, but no `crushon-ai` entry exists in `documentation.ts` (20 records claim `true`, only 19 guides exist). The card guard suppresses the badge, so there is no broken link, but the data model contradicts itself and the Documentation hub lists it under "Other Platforms".
- **Files:** `src/data/chatbots.ts` (CrushOn.AI record), `src/data/documentation.ts`.
- **Recommended fix:** Either author a `crushon-ai` guide or set `docsAvailable: false`.
- **Acceptance test:** The count of `docsAvailable:true` records equals the count of `platformDocs` keys.
- **Supabase impact:** none
- **Estimated scope:** XS

#### UX-012 — Duplicate/near-duplicate TavernAI entries
- **Severity:** P2
- **User-visible problem:** "TavernAI" (`tavernai`, docs) and "TavernAI (legacy)" (`tavernai-legacy`, no docs) both point to `https://github.com/TavernAI/TavernAI` with overlapping descriptions. Two cards for effectively the same project confuse filtering and comparison.
- **File:** `src/data/chatbots.ts` (lines 59 and 644).
- **Recommended fix:** Consolidate into one TavernAI record with a "legacy/discontinued" note in `knownIssues`, and disambiguate against SillyTavern in the description.
- **Acceptance test:** Exactly one TavernAI card appears in the directory; its description distinguishes it from SillyTavern.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-013 — Privacy/logging row in Compare is synthesized, not real data
- **Severity:** P2
- **User-visible problem:** `/compare`'s "Privacy / logging policy" row derives a generic sentence from `bot.category` ("Local-first… / Provider-dependent… / Hosted…") rather than an actual per-platform privacy statement, which can overstate local privacy or misrepresent hosted services.
- **File:** `src/pages/Compare.tsx` (privacy row in `rows`).
- **Recommended fix:** Add a structured `privacyNote` field to `Chatbot` and render it, falling back to "Not disclosed".
- **Acceptance test:** A platform with an explicit note shows that note; a platform without one shows "Not disclosed".
- **Supabase impact:** none
- **Estimated scope:** S

---

### D. Directory filters, search, and layout

#### UX-014 — Global search indexes only title + subtitle
- **Severity:** P2
- **User-visible problem:** The ⌘K search builds each result's `value` from title + subtitle only. Platform descriptions, `nsfwPolicy`, `knownIssues`, and tags are not searchable, so queries like "uncensored" or "long-term memory" miss many platforms — even though the directory's inline search covers those fields.
- **File:** `src/components/GlobalSearch.tsx` (`results` memo, `CommandItem value`).
- **Recommended fix:** Include description and policy fields in the indexed `value` (or filter manually) while keeping the displayed subtitle short.
- **Acceptance test:** ⌘K search for "uncensored" returns the platforms whose policy is uncensored.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-015 — Feature filters rely on fragile substring matching
- **Severity:** P2
- **User-visible problem:** "Group chat" and "Multi-modal" filters use `text.includes("group")` / `text.includes("multi-modal")` over a concatenation of pricing/cardFormat/description/memory. This produces false positives/negatives and is brittle to copy edits.
- **File:** `src/pages/Index.tsx` (`matchesFilter`).
- **Recommended fix:** Add explicit boolean fields (`hasGroupChat`, `hasMultimodal`) to `Chatbot` and filter on those.
- **Acceptance test:** A platform with group chat but no "group" string in its description still matches; a platform with "group" in an unrelated phrase does not.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-016 — "Toggleable" content filter is mislabeled
- **Severity:** P2
- **User-visible problem:** The content filter maps "Toggleable" to `contentLevel === 2` ("Light NSFW"), but "toggleable" semantically means the platform offers a SFW/NSFW switch, not a light-NSFW rating. The label does not describe what the filter does.
- **File:** `src/pages/Index.tsx` (content filter mapping, labels).
- **Recommended fix:** Either relabel to match level 2 ("Light NSFW") or drive the filter from a real "has SFW/NSFW toggle" attribute.
- **Acceptance test:** Selecting the control filters exactly the platforms its label implies.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-017 — No result count and no clear-all for filters
- **Severity:** P2
- **User-visible problem:** The grid shows no "N results" indicator, and the ~23 filter/category chips have no "clear all" affordance; the only way to reset is tapping each chip individually.
- **File:** `src/pages/Index.tsx` (filters + grid).
- **Recommended fix:** Show a result count and a "Clear filters" button when any filter is active.
- **Acceptance test:** Changing a filter updates a visible count; "Clear filters" resets category, content, and attribute filters.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-018 — Filter wall on mobile
- **Severity:** P2
- **User-visible problem:** Category + content + features + access + cards (~23 controls) render as a long stack of wrapping chips above the grid on small screens, pushing the actual results far down.
- **File:** `src/pages/Index.tsx` (filter container).
- **Recommended fix:** Collapse filters behind a "Filters" disclosure/sheet on mobile with a summary of active filters.
- **Acceptance test:** At 375px the filter area is collapsed by default and expandable.
- **Supabase impact:** none
- **Estimated scope:** M

#### UX-019 — Desktop nav has no mid-size breakpoint
- **Severity:** P2
- **User-visible problem:** The full nav (search + 8 labeled items) is shown from `sm` (640px) up. At ~768px this is likely to crowd/overflow, but there is no intermediate breakpoint or collapsing behavior between 640px and desktop.
- **File:** `src/components/Navigation.tsx`.
- **Recommended fix:** Introduce an `lg`-gated full nav (or icon-only items) with the hamburger persisting through tablet widths.
- **Acceptance test:** At 768px all nav items remain reachable without horizontal overflow.
- **Supabase impact:** none
- **Estimated scope:** S

---

### E. Templates / prompt ecosystem

#### UX-020 — Custom templates can't be opened in the Prompt Builder
- **Severity:** P2
- **User-visible problem:** `/prompts` saves custom templates to `localStorage` (`ai-companion-hub-custom-prompts`), but the Prompt Builder tool reads only the static `promptTemplates`. A custom template with `{{variables}}` can never be loaded to fill those variables.
- **Files:** `src/pages/Prompts.tsx`, `src/components/tools/PromptBuilder.tsx`, `src/data/promptTemplates.ts`.
- **Recommended fix:** Merge localStorage custom templates into the Prompt Builder's selector (or add an "Open in Prompt Builder" action per custom card).
- **Acceptance test:** Saving a custom template on `/prompts` then opening the Prompt Builder exposes it in the selector and renders its variables.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-021 — "Copy" on prompt cards yields unresolved `{{variables}}`
- **Severity:** P2
- **User-visible problem:** The dual copy buttons copy the raw template including `{{character_name}}` etc., with no inline variable-fill on the card, so a one-click copy produces a prompt full of placeholder tokens. (Expected for a "library", but the copy CTA implies a ready-to-use result.)
- **File:** `src/pages/Prompts.tsx` (`copy`).
- **Recommended fix:** Either open an inline fill UI before copying, or label the buttons "Copy template" to set expectations.
- **Acceptance test:** Copied output is either filled or clearly labeled as a template.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-022 — AI generation calls in PromptBuilder lack a client timeout
- **Severity:** P2
- **User-visible problem:** Unlike DocConsolidator (which wraps calls in a 15s `withTimeout`), `PromptBuilder`'s `generate-variable` / `generate-all` invoke `venice-ai` with no timeout, so a hung function leaves "Generating…" indefinitely.
- **File:** `src/components/tools/PromptBuilder.tsx`.
- **Recommended fix:** Reuse the same timeout wrapper for all invoke calls.
- **Acceptance test:** Simulated 20s hang shows a timeout toast and clears the spinner.
- **Supabase impact:** read (functions.invoke)
- **Estimated scope:** XS

---

### F. Character card builder

#### UX-023 — "Custom OpenRouter / BYOK" generation mode is a no-op
- **Severity:** P2
- **User-visible problem:** The generation settings gear offers "Default Free API" vs "Custom OpenRouter / BYOK", but `generationMode` is sent to `generate-all` and **ignored** by the edge function. The control implies a real choice; the fine print admits it's a placeholder.
- **Files:** `src/components/tools/CharacterCardBuilder.tsx` (`handleGenerateAll`, settings panel), `supabase/functions/venice-ai/index.ts` (`generate-all`).
- **Recommended fix:** Implement the BYOK path (accept a user key in-memory and route `generate-all` to it) or remove the toggle until it works.
- **Acceptance test:** Selecting BYOK + a key routes generation to that key; without a key, the UI explains the limitation.
- **Supabase impact:** read (functions.invoke)
- **Estimated scope:** M

#### UX-024 — Token budget is a word-count approximation, not a tokenizer
- **Severity:** P2
- **User-visible problem:** Token counts use `ceil(words × 1.3)`. This is rough and can mislead the 2,048-token "permanent definition" warning and the recommended buffer. It is disclosed in the Lorebook tool but not in the card builder.
- **Files:** `src/components/tools/CharacterCardBuilder.tsx` (`permanentTokens`/`variableTokens`), `src/components/tools/LorebookBuilder.tsx` (`tokenCount`).
- **Recommended fix:** Integrate a real tokenizer (`gpt-tokenizer`/`tiktoken`-equivalent) and label counts as estimates if not.
- **Acceptance test:** Count for a known text sample matches a reference tokenizer within tolerance; the 2,048 warning fires accordingly.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-025 — V3 `assets` output is non-conformant
- **Severity:** P2
- **User-visible problem:** The builder emits `assets` as `{type: "expression"|"audio"|"outfit"|"other", uri, name}`, which does not match the official `chara_card_v3` assets schema (specific `type` enum + `uri`/`ext`). Exported V3 cards may be rejected or have their assets ignored by SillyTavern.
- **File:** `src/components/tools/CharacterCardBuilder.tsx` (`AssetDeclaration`, `generateV3Json`).
- **Recommended fix:** Align `assets` with the V3 spec and validate on export.
- **Acceptance test:** Exported V3 JSON validates against the reference `chara_card_v3` schema.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-026 — Chat preview renders speech as bold, not quotes
- **Severity:** P2
- **User-visible problem:** `renderGreeting` wraps `"speech"` in `<strong>` rather than quoting it, and the naive regex misses multi-line/quoted passages.
- **File:** `src/components/tools/CharacterCardBuilder.tsx` (`renderGreeting`).
- **Recommended fix:** Render quoted speech with proper quotes (and keep *actions* italic) using a more robust parser.
- **Acceptance test:** Preview shows `"speech"` quoted and `*actions*` italic for single- and multi-line greetings.
- **Supabase impact:** none
- **Estimated scope:** XS

#### UX-027 — V3-only data (assets) dropped on import
- **Severity:** P2
- **User-visible problem:** `applyParsedCard` only maps keys present in `defaultCard`, so `assets` (and other V3-only fields) are silently discarded when importing a V3 card.
- **File:** `src/components/tools/CharacterCardBuilder.tsx` (`applyParsedCard`).
- **Recommended fix:** Preserve `assets` (and other V3 fields) through import and restore them in state.
- **Acceptance test:** Importing a V3 card with assets re-populates the assets editor.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-028 — Generate/convert calls lack a client timeout
- **Severity:** P2
- **User-visible problem:** `generate-field`, `generate-all`, and `convert-character` invoke `venice-ai` without a timeout, risking a stuck spinner.
- **File:** `src/components/tools/CharacterCardBuilder.tsx`.
- **Recommended fix:** Apply the shared 15s timeout wrapper.
- **Acceptance test:** Simulated hang shows a timeout toast and clears the spinner.
- **Supabase impact:** read (functions.invoke)
- **Estimated scope:** XS

---

### G. Accessibility and empty/loading states

#### UX-029 — No visible focus indicators on custom controls
- **Severity:** P2
- **User-visible problem:** Category chips, filter toggles, card action icon buttons, and tab triggers rely on hover/color changes with no `focus-visible` ring. Keyboard users get no visible focus indication on most interactive elements. (Some icon buttons do provide `aria-label` — that part is good.)
- **Files:** `src/pages/Index.tsx`, `src/components/ChatbotCard.tsx`, `src/components/Navigation.tsx`, `src/pages/Blog.tsx`, `src/pages/Prompts.tsx`.
- **Recommended fix:** Add a consistent `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` treatment to interactive chips/buttons.
- **Acceptance test:** Tab traversal through the directory shows a visible focus outline on every control.
- **Supabase impact:** none
- **Estimated scope:** M

#### UX-030 — Inputs without labels
- **Severity:** P2
- **User-visible problem:** Several inputs have only placeholders and no `<label>`/`aria-label`: the directory search (`Index.tsx`), the ⌘K command input, and the Lorebook bulk keyword/replace inputs.
- **Files:** `src/pages/Index.tsx` (search `Input`), `src/components/GlobalSearch.tsx`, `src/components/tools/LorebookBuilder.tsx`.
- **Recommended fix:** Add associated labels or `aria-label` to each input.
- **Acceptance test:** Automated a11y check reports no unlabeled inputs on these pages.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-031 — Community gallery error state indistinguishable from empty
- **Severity:** P2 (covered conceptually in UX-007; kept here for the a11y/empty-state lens)
- **User-visible problem:** No loading spinner and no error message — a failed read renders "No shared cards yet."
- **File:** `src/pages/Community.tsx`.
- **Recommended fix:** Add loading/error/empty states (as in UX-007).
- **Acceptance test:** Loading shows a spinner; failure shows an error; empty shows the empty copy.
- **Supabase impact:** read
- **Estimated scope:** S

#### UX-032 — NotFound bypasses layout and age gate
- **Severity:** P2
- **User-visible problem:** `NotFound` is not wrapped in `Layout`, so it has no nav/footer, uses a full-page `<a href="/">` reload, and is served outside the age gate; it also logs a `console.error` in production.
- **File:** `src/pages/NotFound.tsx`.
- **Recommended fix:** Wrap in `Layout`, use `Link` for client navigation, and drop the production console error (or gate it behind `import.meta.env.DEV`).
- **Acceptance test:** A 404 route renders with nav/footer and returns home via client navigation.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-033 — Age gate "Leave" hardcodes an external redirect
- **Severity:** P2
- **User-visible problem:** The under-18 button hardcodes `window.location.href = "https://www.google.com"`, an arbitrary destination; and the gate is `localStorage`-only (self-attestation, trivially bypassable — acceptable for a self-declared gate, but the arbitrary redirect is odd).
- **File:** `src/components/AgeGate.tsx`.
- **Recommended fix:** Redirect to a neutral exit page or simply show a message; document that the gate is self-attestation only.
- **Acceptance test:** Clicking "Leave" navigates to an intended, on-brand destination.
- **Supabase impact:** none
- **Estimated scope:** XS

---

### H. Responsive / misc

#### UX-034 — Compare matrix requires horizontal scroll on mobile
- **Severity:** P2
- **User-visible problem:** The `/compare` table uses `min-w-[760px]`, forcing horizontal scroll at 375px with no affordance hint; the attribute column sticks horizontally but not vertically.
- **File:** `src/pages/Compare.tsx`.
- **Recommended fix:** Add a scroll hint/edge fade and sticky header; consider a card-per-platform layout under `md`.
- **Acceptance test:** At 375px the comparison is horizontally scrollable with visible affordance and a sticky attribute column.
- **Supabase impact:** none
- **Estimated scope:** S

#### UX-035 — og-image used as favicon
- **Severity:** P3 (polish)
- **User-visible problem:** `index.html` sets `<link rel="icon" href="/og-image.png">` (a 1200×630, ~70 KB social image) while a proper 20 KB `favicon.ico` exists in `/public`.
- **File:** `index.html` (line 8), `public/favicon.ico`.
- **Recommended fix:** Point the icon link at `favicon.ico` (or a dedicated SVG/PNG favicon).
- **Acceptance test:** Devtools network tab loads a small favicon, not `og-image.png`.
- **Supabase impact:** none
- **Estimated scope:** XS

#### UX-036 — API tester caps visible models at 12 and is CORS-prone
- **Severity:** P2
- **User-visible problem:** Model cards render `models.slice(0, 12)` with no "show all" (the Select lists all, inconsistently). Requests go browser-direct to the endpoint, so Kobold/local servers without CORS headers will fail; the "Kobold" default endpoint is empty.
- **File:** `src/components/tools/ApiTester.tsx`.
- **Recommended fix:** Route requests through a small proxy (like `/api/fetch-doc`) to avoid CORS, or document the CORS requirement; add "show all" for models and a sensible Kobold default.
- **Acceptance test:** A local endpoint with no CORS still loads models via the proxy; all models are reachable in the UI.
- **Supabase impact:** none (or read if proxied through an edge function)
- **Estimated scope:** M

---

## Ranked implementation tasks (first 10)

Ordered by severity × user impact × dependency, not by effort.

1. **Harden the Supabase client (UX-001).** Guard/lazy-init the client, add an `isSupabaseConfigured` flag, degrade `useAiBackend`/`Community` gracefully, and commit `.env.example`. — P0 · S
2. **Fix the AI health false positive (UX-004).** Make `health` verify a configured provider key so the UI stops enabling AI actions that are guaranteed to fail. — P1 · S
3. **Implement the community publish path + deep-link (UX-003).** Add a share action in the CharacterCardBuilder (insert + RLS-consistent `user_id`) and make "Open in Card Builder" load the card. — P1 · M
4. **Replace the dead submission email (UX-002).** Point to a real inbox/form or make copy-to-clipboard the primary action. — P1 · S
5. **Resolve data inconsistencies (UX-009, UX-011, UX-012).** Fix the hardcoded "16", reconcile `docsAvailable` for CrushOn.AI, and consolidate the duplicate TavernAI records; update the stale tests (UX-010). — P2 · S
6. **Finish the branding pass (UX-008).** Remove all remaining "NSFW AI Chatbot Directory / NSFW AI Insights" strings in user-visible and SEO/sr-only text and README. — P2 · S
7. **Make the directory filter/search layer honest (UX-014, UX-015, UX-016, UX-017, UX-018).** Index full-text search in ⌘K, replace substring feature filters with explicit fields, relabel "Toggleable", add result count + clear-all, and collapse filters on mobile. — P2 · M
8. **Add loading/error states and timeouts (UX-007/UX-031, UX-022, UX-028).** Distinct gallery loading/error/empty states and 15s timeouts on all `venice-ai` invoke calls. — P2 · S
9. **Align V3 output with the spec (UX-025, UX-027) and wire BYOK (UX-023).** Fix `assets` schema and import round-trip; implement or remove the BYOK mode. — P2 · M
10. **Accessibility pass (UX-029, UX-030, UX-032).** Visible focus rings, input labels, and a Layout-wrapped NotFound. — P2 · M

### Quick win backlogs (out of top-10, cheap)
- UX-005 (un-gate URL Fetch from AI status) · XS
- UX-006 (remove dead `fetch-url` edge action) · XS
- UX-024 (real tokenizer) · S
- UX-026 (chat preview quoting) · XS
- UX-033 (age-gate exit target) · XS
- UX-034 (compare mobile affordance) · S
- UX-035 (favicon) · XS
- UX-036 (API tester proxy + model paging) · M

---

## Legend

- **Severity:** P0 blocking · P1 core usability · P2 polish.
- **Supabase impact:** none / read / write / auth / storage.
- **Scope:** XS (<0.5 day) · S (0.5–1 day) · M (1–3 days) · L (>3 days).
