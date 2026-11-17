# AI Companion Hub

A curated directory of AI companion and roleplay platforms — local frontends, hosted roleplay platforms, character libraries, companion apps, model providers, and image+chat hybrids — with setup documentation, comparison tools, and creator resources for roleplay power users. Adult content levels are disclosed per platform; this site does not run models.

## What's inside

- **Directory** — 59+ platforms with structured data: model, pricing, context window, API access, memory, known issues, character card format, content level (1–5), and last-verified date.
- **Compare view** — multi-select up to 6 platforms and compare 14 attributes side-by-side.
- **Documentation hub** — full setup guides for major platforms (SillyTavern, OpenRouter, Kindroid, Replika, Janitor AI, etc.) with in-page TOC and "last reviewed" dates.
- **Tools**
  - **Character Card Builder** — V2/V3 character cards with PNG chunk embed/extract, alternate greetings editor, live JSON validation, and AI field generation.
  - **Doc Consolidator** — paste docs or fetch a URL to generate a structured markdown expert guide via AI.
  - **Prompt Builder** — prompt templates and variables with AI generation.
- **Blog** — real articles on the ecosystem (SillyTavern vs RisuAI, character cards, local GPU setup, lorebooks).
- **Community** — Reddit, Discord, character libraries, the Chatbots Webring, and a platform-submission form.

## Tech stack

- **Vite** + **React 18** + **TypeScript**
- **Tailwind CSS** + shadcn/ui components
- **React Router** (client-side routing)
- **Supabase** for the AI backend edge function (`venice-ai`)
- **Vitest** + Testing Library for tests

## Getting started

```sh
npm install
npm run dev
```

The dev server runs on `http://localhost:8080`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | ESLint over the project |
| `npm test` | Run the Vitest suite |
| `npm run preview` | Preview the production build |

## Project structure

```
src/
  components/        UI components (Navigation, ChatbotCard, GlobalSearch, Layout, tools/)
  components/ui/     shadcn/ui primitives
  data/              chatbots, documentation, blog posts, prompt templates, community resources
  hooks/             useAiBackend, useDebounce, use-toast
  integrations/      Supabase client
  lib/               utils, PNG chunk helpers
  pages/             Index, Documentation, PlatformDocs, Tools, Blog, BlogPost, Community, NotFound
  test/              Vitest setup + render tests
supabase/
  functions/venice-ai/   Edge function: health, fetch-url, consolidate, character-card + prompt generation
```

## AI backend (Supabase edge function)

The tools' AI features (card generation, doc consolidation, prompt generation, URL fetching) run through the `venice-ai` Supabase edge function. On the shared server path, it tries providers in order: **Venice** (`zai-org-glm-4.7-flash`) → **OpenRouter** → **OneProvider** using the `VENICE_API_KEY`, `OPENROUTER_API_KEY`, and `ONEPROVIDER_API_KEY` server secrets.

AI can run three ways:

1. **Shared backend / Simple path (default).** Zero visitor setup. `VENICE_API_KEY` is tried first (`zai-org-glm-4.7-flash` streaming), then `OPENROUTER_API_KEY` (Venice Uncensored, Euryale, MythoMax, Gemma instruct), then `ONEPROVIDER_API_KEY` (`grok-4.7`, `glm-5.3-flash`).
2. **BYOK / Power path.** A visitor can supply their own API key(s) for **Venice**, **OpenRouter**, and/or **OneProvider**, choose their preferred provider, and pick from live-fetched provider models (or enter any model ID). Visitor keys are stored only in browser `localStorage`, forwarded per request, and never persisted or logged server-side.
3. **Request access.** When neither is available, the UI offers a form (mailto fallback) so access can be granted case by case.

Deploy after changing it:

```sh
npx supabase functions deploy venice-ai
```

Set secrets with `npx supabase secrets set VENICE_API_KEY=... OPENROUTER_API_KEY=... ONEPROVIDER_API_KEY=...`.

The web app probes the function on load; if it is unreachable AND no visitor key is set, tools show a graceful-degradation banner, offer the BYOK/request paths, and manual editing/export still work.

## Content-level disclaimer

Content levels (1–5) on platform cards are **based on platform claims and community reports**, not first-party audits. Platform policies change — always verify before relying on them. Each entry carries a `lastVerified` date for that reason.

## Data model

Each platform entry in `src/data/chatbots.ts` includes: `name`, `slug`, `type`, `description`, `category` (one of six), `contentLevel` (1–5), `hasExplicitChat` / `hasImageGen` / `hasVoice` flags, `model`, `pricing`, `contextWindow`, `apiAccess`, `memory`, `knownIssues`, `cardFormat`, `url`, `docsAvailable`, and `lastVerified`.

## Contributing

Know a missing platform? Use the **Submit a Platform** form on the Community page, or open a PR against `src/data/chatbots.ts` with the structured fields above.
