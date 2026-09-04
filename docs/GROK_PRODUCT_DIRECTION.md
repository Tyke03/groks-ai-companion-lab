# AI Companion Hub - Product Direction

**Branch:** `grok/product-direction-batch-1`
**Status:** Direction locked for Batch 1 implementation
**Last updated:** 2026-09-03 (America/Denver)

---

## 1. One-sentence product thesis

AI Companion Hub is a verification-first directory and local workbench: compare companion platforms with dated evidence, then build cards and prompts on your machine — we do not run the models.

---

## 2. Primary user and highest-value job to be done

**Primary user:** An adult roleplay / companion power user who already knows (or is learning) local frontends, hosted companions, and model providers, and wants honest comparison before committing setup time.

**Highest-value JTBD:** Help me pick the right platform with dated, comparable evidence, then give me offline/local builders so I can prepare cards and prompts without this site hosting chat or taking my money.

Secondary jobs (still valuable, lower priority for Batch 1):

- Scan setup guidance and policy notes before installing a frontend.
- Keep a short prompt/card drafting loop on-device.
- Follow light updates/blog/community without those becoming the homepage story.

---

## 3. What is confusing / low-value today

### Navigation (8 always-visible items)

Current top bar: **Directory, Compare, Docs, Tools, Updates, Blog, Prompts, Community**.

Problems:

- Eight peer links flatten priority. Discover and Compare (core) sit beside Updates/Blog/Community (secondary).
- Labels are inventory-oriented (`Directory`, `Docs`, `Tools`) rather than job-oriented (`Discover`, `Guides`, `Workbench`).
- Desktop density plus icons make the bar feel like a CMS admin strip, not a product entry.

### Homepage

- Header is a short title plus paragraph, then **immediate drop into sticky search/filters/grid**.
- No clear above-the-fold path split: browse vs compare vs open the local workbench.
- Honesty (we do not run the models) is buried in body copy instead of a visible product strip.
- Compare UX is dual: a bottom tray that both navigates to `/compare` **and** opens a redundant Sheet drawer with a mini table — friction about which comparison UI is canonical.

### Workbench / BYOK

- Character Card Builder exposes a **Custom OpenRouter / BYOK** generation-mode toggle that is unfinished (placeholder; must not collect keys or imply live BYOK).

---

## 4. Proposed information architecture

### Nav (primary + More)

**Primary (always visible):**

| Label | Route | Notes |
|-------|-------|--------|
| Discover | `/` | Platform directory (was Directory) |
| Compare | `/compare` | Canonical side-by-side comparison |
| Workbench | `/tools` | Local builders (was Tools) |
| Guides | `/docs` | Documentation hub (was Docs) |

**Secondary (More dropdown / overflow):**

| Label | Route |
|-------|-------|
| Prompts | `/prompts` |
| Blog | `/blog` |
| Updates | `/updates` |
| Community | `/community` |

Mobile: same primary list, then a More group or listed secondary links under a divider.

### Homepage sections (in order)

1. **Hero** — title, one-line thesis, honesty strip, three CTAs.
2. **Discovery** — existing search + filters + result count + chips (preserve filter logic).
3. **Platform grid** — existing cards + compare multi-select.
4. **Footer honesty / verify note** — keep last-verified and policy caveats.

### Platform discovery flow

Discover -> filter/search -> open card / docs -> optional add-to-compare -> Compare or Guides.

### Comparison flow

Select 2-5 on Discover -> tray Compare -> land on `/compare?platforms=...` (full page). No parallel mini-table drawer as the primary experience.

### Local builder / workbench flow

Workbench (`/tools`) -> Character / Prompt / Doc consolidator tabs (plus deep links to lorebook, persona, API tester). Framing: **local experiment / on-device drafting**, not hosted generation product.

### Docs / guidance flow

Guides (`/docs`) -> platform list -> `/docs/:slug` with TOC, quick facts, reviewed dates.

---

## 5. Preserve / simplify / remove-or-hide

| Area | Decision |
|------|----------|
| Platform records (incl. TavernAI / tavernai-legacy) | **Preserve** — never delete |
| Directory filters, search, chips, card grid | **Preserve** logic; reframe under Discover |
| Full Compare page | **Preserve** as canonical comparison UI |
| Index compare Sheet drawer | **Simplify / de-emphasize** — tray navigates to `/compare`; remove redundant drawer table |
| Prompts, Blog, Updates, Community pages | **Preserve**; demote in nav under More |
| Character / Prompt / Doc builders | **Preserve**; Workbench framing |
| BYOK / Custom OpenRouter toggle | **Hide** from visible UI (do not implement key handling) |
| Affiliate / payments / accounts / live chat | **Stay absent** — do not invent |
| External APIs, credentials, deployment config | **Do not add** |

---

## 6. Visual direction

Distinctive without gimmick:

- Calm **lab / evidence** aesthetic: subtle section banding, light grid or hairline borders, restrained teal accent already in tokens.
- Stronger display hierarchy: hero display type, quieter meta/honesty strip, CTA accent vs secondary outline.
- Avoid neon glows, rainbow gradients, or AI chatbot marketplace flash.
- Extend CSS lightly (`lab-grid`, `section-band`, honesty pill) on existing Tailwind / HSL tokens.
- Keep a11y: skip link, contrast, focus rings, 44px mobile targets.

---

## 7. Honesty about limits

This experiment:

- Does **not** host models or provide live chat.
- Does **not** take payments, subscriptions, or affiliates.
- Does **not** implement real BYOK / credential collection.
- Does **not** invent platform stats, verification dates, or capability claims.
- Catalogs and compares with **dated evidence**; users verify before relying on policies.
- Local workbench tools draft cards/prompts on the users machine; any optional AI assist depends on an already-configured backend and must stay clearly optional / degrade gracefully.
---

## 8. Ranked implementation batches

### Batch 1 - Presentation / nav / IA / safe local display

- Collapse nav: Discover, Compare, Workbench, Guides plus More.
- Homepage hero: thesis, honesty strip, three CTAs, then discovery.
- Lab/evidence visual hierarchy using existing Tailwind tokens.
- Hide unfinished credential-mode UI in CharacterCardBuilder.
- Soften dual-compare: tray goes to /compare; remove drawer table.
- Update string assertions in tests to match new labels.
- Preserve all platform records; no remote publish in this batch.


### Batch 2 - Evidence depth + compare clarity (later)

- Strengthen card/detail evidence presentation without inventing data.
- Compare page polish: empty states, shareable query UX, attribute grouping.
- Guides hub IA: clearer start-here vs deep platform docs.
- Workbench empty/unavailable states honest about backend limits.

### Batch 3 - Content + secondary surfaces (later)

- Prompts library framing as reference, not a hosted prompt product.
- Blog/Updates/Community copy alignment with thesis; keep under More.
- Optional lightweight onboarding callouts on Discover.
- Still no payments, hosted models, live chat, or real credential handling.

---

## Changelog

- **2026-09-03** - Initial product direction document committed on grok/product-direction-batch-1.

- **2026-09-03** - Batch 1 landed on this branch.

