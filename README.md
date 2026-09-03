# NSFW AI Chatbot Directory

A curated directory of NSFW AI chatbot platforms — local frontends, hosted roleplay platforms, character libraries, companion apps, model providers, and image+chat hybrids — with setup documentation, comparison tools, and creator resources for roleplay power users.

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

The tools' AI features (card generation, doc consolidation, prompt generation, URL fetching) run through the `venice-ai` Supabase edge function. It tries providers in order: **Venice AI** → **OpenRouter** → **Lovable AI Gateway**, using `VENICE_API_KEY`, `OPENROUTER_API_KEY`, and `LOVABLE_API_KEY` environment secrets.

Deploy after changing it:

```sh
npx supabase functions deploy venice-ai
```

The web app probes the function on load; if it's unreachable, tools show a graceful-degradation banner and manual editing/export still work.

## Content-level disclaimer

Content levels (1–5) on platform cards are **based on platform claims and community reports**, not first-party audits. Platform policies change — always verify before relying on them. Each entry carries a `lastVerified` date for that reason.

## Data model

Each platform entry in `src/data/chatbots.ts` includes: `name`, `slug`, `type`, `description`, `category` (one of six), `contentLevel` (1–5), `hasExplicitChat` / `hasImageGen` / `hasVoice` flags, `model`, `pricing`, `contextWindow`, `apiAccess`, `memory`, `knownIssues`, `cardFormat`, `url`, `docsAvailable`, and `lastVerified`.

## Contributing

Know a missing platform? Use the **Submit a Platform** form on the Community page, or open a PR against `src/data/chatbots.ts` with the structured fields above.
