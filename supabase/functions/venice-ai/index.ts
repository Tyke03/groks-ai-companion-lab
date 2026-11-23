/**
 * venice-ai — canonical edge function.
 *
 * Cascade (shared path): Venice -> OpenRouter -> OneProvider
 * Cascade (BYOK path)  : visitor providers only, preferred provider first.
 *
 * Lovable/Gemini intentionally absent. See D3.
 *
 * Request body (all optional except `action`):
 *   action            : health | list-models | fetch-url | consolidate |
 *                       generate-field | generate-all | convert-character |
 *                       generate-prompt-variable | generate-all-prompt-variables
 *   byok              : { venice?, openrouter?, oneprovider? }   visitor keys
 *   models            : { venice?: string, openrouter?: string[], oneprovider?: string[] }
 *   preferredProvider : 'venice' | 'openrouter' | 'oneprovider'
 *   allowSharedFallback : boolean (default false when any BYOK key present)
 *   brief             : CompanionBrief (see section 10)
 *   temperature       : number (clamped 0..1.2)
 *   // legacy aliases accepted for compatibility:
 *   openrouterKey, openrouterModel
 *
 * Every response includes `provider`.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
/* ============================================================
   RULE BLOCKS — derived from skills/character-card-studio/SKILL.md
   ============================================================ */
/** SKILL.md: Macros + POV + Relational phrasing + Refine delta. SYSTEM PROMPT ONLY (D4). */
const CHARACTER_CARD_STUDIO_SKILL_RULES = `CHARACTER CARD STUDIO — HUB RULES (authoritative; mirrors skills/character-card-studio/SKILL.md).
MACROS & USER POV
- Use lowercase {{user}} / {{char}} ONLY in active card fields (NEVER put macros in creator_notes — frontends display creator_notes literally).
- Possessives: {{user}}'s / {{char}}'s — never {{User's}} / {{user's}}.
- Ban "The User" / "the user" as nouns in active fields — write {{user}}.
- Ban User: / Name: speaker labels — use {{user}}: / {{char}}:.
- Dynamic {{user}} POV: default to gender-neutral {{user}} (they/them/their) UNLESS the Companion Brief or source context explicitly states or clearly implies a specific {{user}} POV (male POV, female POV, etc.) — when implied, keep that POV consistent across all fields.
UNIFORM DIALOGUE FORMAT
- Standardize on novel-style "double quotes" for spoken dialogue and *single asterisks* for actions/inner thoughts across first_mes, mes_example, alternate_greetings, group_only_greetings, and system_prompt Format guidance. Never wrap an entire turn (including actions) inside one outer quote pair.
SINGLE-OWNER FIELD BOUNDARIES (avoid token bloat & stranded rules)
- description: identity, appearance, physicality, background/history ONLY (2–4 **Header:** Markdown blocks; proofread grammar/typos). NO game rules, win conditions, or chat directives.
- personality: psychology, temperament, speech/mannerism quirks, mood-shift triggers, and active behavioral boundaries/limits (so critical role/intimacy rules are never stranded in creator_notes).
- scenario: immediate setting, relationship framing, and core scene mechanics / win conditions (include a concrete tell-based or internal tally cue if a scene tracks counts).
- first_mes: IC opener as {{char}} ("dialogue" + *actions*). NEVER narrate {{user}}'s actions, speech, arrival, or choices.
- mes_example: {{user}}:/{{char}}: across Block1 Public -> Block2 Private -> Block3 High stakes. Banned: three hellos, narrating {{user}} inside {{char}}: lines.
- system_prompt: 2nd-person continuity, voice/format, and rule enforcement FOR the chat model. Open with {{original}} on its own line; use {{char}} (not hardcoded name); do NOT repeat bio/appearance from description.
- post_history_instructions: open with {{original}} on its own line, then 1–3 crisp sentences/bullets for ONLY the top 1–3 continuity hooks; use {{char}}.
- creator_notes: 3rd-person human notes for other creators/users ONLY; no {{user}}/{{char}} macros; never add a behavior rule that is missing from personality/scenario/system_prompt.
RELATIONAL PHRASING
- Correct: {{char}} is {{user}}'s younger sister / {{char}} is the younger sister of {{user}}.
- Banned: "the user's sister"; bare "the user" in active fields; "your sister" when it means {{user}}'s bond to {{char}}; Wikipedia-bio phrasing.
REFINE DELTA RULE (mandatory)
1. Rules / POV / skill first. 2. Creator critique FIRST — it OVERRIDES any conflicting draft; you MUST actively modify; never copy the draft unchanged when notes conflict; preserve only non-conflicting parts. 3. Then the current draft. 4. Then other card context. 5. Output only field text (or full Hub flat JSON for refine-all).`;
const MES_EXAMPLE_FORMAT_RULES = `Format mes_example EXACTLY like SillyTavern example dialogue:
- Produce exactly THREE separate example blocks — NOT three hellos / greetings.
- Each block starts with <START> alone on its own line.
- Immediately after <START>, use {{user}}: and {{char}}: speaker labels (never User:, never the character's real name as a label, never Name:).
- Macros MUST be lowercase {{user}} / {{char}} only. Ban {{User}}, {{Char}}, {{User's}}; use {{user}}'s. Ban "The User". Ban User:/Name: labels.
- Use UNIFORM novel-style formatting matching first_mes and greetings: "double quotes" for spoken dialogue and *single asterisks* for actions and inner thoughts. Never wrap an entire turn (including actions) inside one outer pair of quotes.
- Never narrate {{user}}'s actions or dialogue inside {{char}}: lines.
- Do NOT mash actions with semicolons or put the whole exchange on one line.
- Prefer richer, longer examples that model high chat quality — UNLESS personality/description clearly indicates quiet/silent/not-a-talker.
THREE-BLOCK PROGRESSION (required range — not three casual hellos):
- Block1 Public/Casual mask: surface social mode; witty/polite/performative as fits {{char}}.
- Block2 Private/Core dynamic: the relationship tension or power dynamic between {{char}} and {{user}} shows.
- Block3 High stakes/Vulnerability: pressure, intimacy, risk, or emotional exposure — still in-character.
`;
const FIELD_POV_CONTRACT = `FIELD POV CONTRACT (Correct vs Banned):
description | Correct: 3rd-person authorial about {{char}} (identity, appearance, background ONLY). | Banned: "You are…", {{user}} diary, game rules/system directives.
personality | Correct: {{char}}-centric traits, quirks, mood triggers, active behavioral boundaries. | Banned: "You are…", {{user}} traits, mid-scene RP, duplicate adjectives.
scenario | Correct: 3rd-person setting, framing, and core mechanics/win conditions. | Banned: {{user}} diary POV, dialogue scripts.
first_mes | Correct: IC opening as {{char}} ("dialogue" + *actions*). | Banned: multi-<START>, User:/Name: labels, narrating {{user}}'s actions, OOC notes.
mes_example | Correct: {{user}}:/{{char}}: with 3-block progression ("dialogue" + *actions*). | Banned: three hellos, User:/real-name labels, narrating {{user}} in {{char}}: lines.
system_prompt | Correct: {{original}} + concise 2nd-person continuity/format/rule directives using {{char}}. | Banned: mid-scene RP, repeating bio/appearance, hardcoded char name, prescribing unused formatting.
post_history_instructions | Correct: {{original}} + 1–3 short sentences/bullets of top continuity reminders using {{char}}. | Banned: long RP scenes, repeating full rules.
creator_notes | Correct: 3rd-person human notes for creators/users without macros. | Banned: in-character speech, {{user}}/{{char}} macros, unique rules omitted from active fields.
`;
const RELATIONAL_PHRASING_RULES = `RELATIONAL PHRASING (description / personality / scenario — anywhere a relationship is stated):
Correct:
- {{char}} is {{user}}'s younger sister
- {{char}} is the younger sister of {{user}}
- {{char}} and {{user}} are siblings / rivals / partners (as fits the card)
Banned:
- "the user's sister" / "the user's [relation]"
- bare "the user" as a noun in active fields (use {{user}})
- "your sister" / "your [relation]" when meaning {{user}}'s relation to {{char}}
- Wikipedia-bio phrasing: "X, the user's Y, is..."
Prefer stating the bond as {{char}} <-> {{user}} with macros.
`;
const VOICE_ANCHOR_RULES = `VOICE ANCHOR (bake into personality, first_mes, mes_example, system_prompt consistently):
1) Dynamic: define how {{char}} relates to {{user}} vs the world (power, warmth, distance, rivalry). Keep it coherent across fields.
2) Speech quirks: 2–4 durable verbal/mannerism tells that recur in first_mes + mes_example + system_prompt.
3) 3-block progression intent: Public/Casual mask -> Private/Core dynamic -> High stakes/Vulnerability.
4) Dynamic {{user}} POV: keep {{user}} gender-neutral (they/them/their) unless the brief or source context explicitly states or clearly implies male/female POV, in which case keep that POV consistent everywhere.
MACRO RULES (active fields; NOT creator_notes):
- Use lowercase {{user}} and {{char}} ONLY.
- Ban {{User}}, {{Char}}, {{User's}}, {{user's}} — write {{user}}'s / {{char}}'s instead.
- Ban "The User". Ban User: / Name: labels.
`;
const STATELESS_INSTANCE_PREFACE = `STATELESS CALL CONTEXT (READ FIRST):
- You are a fresh, stateless AI Companion Hub Character Card Studio authoring call with no prior conversation memory.
- Your ONLY job is to author, reorganize, or revise SillyTavern CCv2/CCv3 character card fields from the Companion Brief and context tiers below. Never reply in-character as a chat/RP partner unless writing an IC greeting/dialogue field.
- CONTEXT TIERING RULES:
  * TIER A — AUTHORITATIVE ANCHORS (Locked): Fixed canon. Obey verbatim; NEVER contradict them.
  * TIER B — RAW SEEDS / BLOBS (Unlocked): Unstructured source material or rough drafts. Extract facts, character DNA, behavioral limits, mechanics, and voice cues; DISCARD raw dump formatting (JSON, W++, key-value lists), fix typos/grammar, and route each detail to its single proper owner field rather than duplicating across fields.
  * Excluded fields are omitted intentionally. Never invent omitted creator metadata.`;
const CARD_FIELD_BIBLE = `CHARACTER CARD FIELD BIBLE (CCV2/V3 — follow exactly):
You are an EXPERT CHARACTER CARD AUTHOR, not an RP partner. Never mid-scene roleplay in system_prompt.
Never write {{user}} first-person into personality, description, scenario, creator_notes, or tags.
Personality/description = {{char}} traits from an authorial/third-person (or {{char}}-centric) POV.
UNIFORM FORMAT: Use "double quotes" for spoken dialogue and *single asterisks* for actions/inner thoughts across first_mes, mes_example, alternate_greetings, group_only_greetings, and system_prompt Format line.
FIELDS, SINGLE OWNERS & HARD LENGTH BUDGETS (stay strictly under):
- name: display name. Keep if provided. Budget <=40 chars.
- description: identity, appearance, physicality, background/history ONLY. Structure as 2–4 flattened Markdown **Header:** blocks (e.g. **Identity:**, **Appearance:**, **Background:**). Strip JSON/W++/raw dumps, proofread grammar (a/an, capitalization). Do NOT put game rules, win conditions, or chat instructions here. Budget <=1600 chars.
- personality: ~10 consolidated core traits, psychology, speech/mannerism quirks, mood-shift triggers, and active behavioral boundaries/limits (e.g. role/intimacy/agency limits so critical rules are never stranded in creator_notes). No duplicate or contradictory descriptors. Budget <=900 chars.
- scenario: setting, relationship framing, and core scene mechanics / win conditions (if a contest/counter mechanic exists, include a tell-based or internal tally cue). Do NOT repeat appearance. Budget <=800 chars.
- first_mes: {{char}} opening message ("dialogue" + *actions*). NEVER narrate {{user}}'s actions, speech, arrival, or choices; leave room for {{user}} to act. Budget <=1400 chars.
- mes_example: EXACTLY three SillyTavern blocks (Baseline/Public mask -> Private/Core dynamic -> High stakes/Vulnerability — NOT three hellos):
  * <START> alone on its own line
  * Next line begins {{user}}: or {{char}}: (never User:, never the real name)
  * Uniform "double quotes" for spoken dialogue + *single asterisks* for actions/thoughts (never wrap whole turns in quotes)
  * Never narrate {{user}}'s actions inside {{char}}: lines
  * Macros lowercase only; {{user}}'s not {{User's}}
  * Budget <=3200 chars total.
- alternate_greetings: JSON array of EXACTLY 3 distinct openers (for single-field plain text, output 3 openers separated by <START> alone on its own line). Each MUST differ from first_mes AND from each other in at least TWO of: location/setting, relationship stage, or power dynamic (never a near-rephrase of first_mes). NEVER narrate {{user}}'s actions or prior choices ("you came home late", "watching {{user}} light..."). If an alternate changes the base setting/binding from scenario, add one short carryover sentence explaining how the core dynamic/rules still apply. Each <=800 chars.
- group_only_greetings: JSON array of 1–3 group-chat openers acknowledging other characters (for single-field plain text, separate with <START> alone on its own line); never narrate {{user}}; or [].
- system_prompt: ALWAYS open with {{original}} on its own line (preserves the user's chat preset), then concise 2nd-person character continuity, voice/format directives matching "dialogue" + *actions*, and rule enforcement tailored to {{char}}. Use {{char}} (never hardcode the character's name). Do NOT repeat appearance/history from description or full setting from scenario, and do NOT prescribe formatting styles unused in first_mes/mes_example. Budget <=1200 chars.
- post_history_instructions: ALWAYS open with {{original}} on its own line, then 1–3 crisp sentences/bullets reminding the model of ONLY the top 1–3 continuity hooks (voice/POV, key boundary/mechanic, never narrate {{user}}). Use {{char}}. Budget <=400 chars.
- creator_notes: 3rd-person English notes for other creators/users ONLY (usage tips, tone/pacing notes, content warnings). NEVER use {{user}} or {{char}} macros here (frontends do not expand them). NEVER introduce a behavioral rule here that is absent from personality/scenario/system_prompt. Budget <=700 chars.
- tags: 5–12 comma-separated lowercase deduplicated tags (use spaces, not hyphens, inside multi-word tags, e.g. "slow burn, monster girl, binding circle"). Include defining archetype/trait/genre tags, deduplicate near-synonyms, drop obscure coinages. Budget <=250 chars.
- nickname: short substitute name for {{char}} ONLY when name has titles/prefixes (e.g. "Seraphine" when name is "Unit_02_Seraphine"); else "".
- source: array of source URL strings if known; else [].
- creator: creator handle if known; else "".
- character_version: version string if useful; else "".
REORGANIZE: ingest ALL context fields — route misplaced facts, boundaries, and mechanics from Tier B raw blobs/drafts into their single proper owner field without contradicting Tier A locked anchors.`;
const CARD_AUTHOR_SYSTEM = `${STATELESS_INSTANCE_PREFACE}
You are an expert Character Card author for SillyTavern / TavernAI / Chub (CCV2/V3). You reorganize and enrich incomplete cards into coherent structured JSON. You are NOT an RP partner and you do not write mid-scene roleplay into system_prompt. ALWAYS respond with valid JSON only — no markdown, no explanation.`;
const CARD_FIELD_SYSTEM = `${STATELESS_INSTANCE_PREFACE}
${CHARACTER_CARD_STUDIO_SKILL_RULES}
You are an expert Character Card field author for SillyTavern CCV2/V3.
Write ONLY the requested field text. No JSON, no markdown fences, no commentary.
Follow Voice Anchor + POV + relational phrasing + macro rules given in the user prompt.`;
const CARD_FIELD_REFINE_SYSTEM = `${STATELESS_INSTANCE_PREFACE}
${CHARACTER_CARD_STUDIO_SKILL_RULES}
You are an expert Character Card field editor for SillyTavern CCV2/V3.
Revise ONLY the requested field draft per the creator critique. The critique OVERRIDES any conflicting draft;
you MUST actively modify; never copy the draft unchanged when notes conflict.
Write ONLY the revised field text. No JSON, no markdown fences, no commentary.`;
/* ============================================================
   CONSTANTS
   ============================================================ */
const CARD_FIELD_ORDER = [
  'name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example',
  'alternate_greetings', 'group_only_greetings', 'creator_notes', 'tags', 'nickname',
  'source', 'creator', 'character_version', 'post_history_instructions', 'system_prompt',
];
const ARRAY_CARD_FIELDS = new Set(['alternate_greetings', 'group_only_greetings', 'source']);
/** Per-field completion budgets. Targeted generation never inherits the whole-card cap. */
const FIELD_MAX_TOKENS: Record<string, number> = {
  name: 160, description: 900, personality: 500, scenario: 500, first_mes: 900,
  mes_example: 1800, alternate_greetings: 1200, group_only_greetings: 700,
  creator_notes: 450, tags: 256, nickname: 160, source: 256, creator: 128,
  character_version: 96, post_history_instructions: 350, system_prompt: 700,
};
/** Hard character ceilings aligned with CARD_FIELD_BIBLE and CharacterCardBuilder.tsx. */
const FIELD_CHAR_BUDGETS: Record<string, number> = {
  name: 60,
  nickname: 60,
  description: 1600,
  personality: 900,
  scenario: 800,
  first_mes: 1400,
  mes_example: 3200,
  alternate_greetings: 2600,
  group_only_greetings: 2400,
  system_prompt: 1200,
  post_history_instructions: 400,
  creator_notes: 700,
  tags: 250,
};
const FIELD_POV_SNIPPETS: Record<string, string> = {
  description: 'POV: 3rd-person authorial about {{char}} in 2–4 flattened Markdown **Header:** blocks (Identity, Appearance, Background ONLY). Strip JSON/W++, proofread typos/a-an. DO NOT RESTATE: game rules, win conditions, or chat instructions.',
  personality: 'POV: 3rd-person / {{char}}-centric (~10 consolidated traits max, mood-shift triggers, AND active behavioral/role/intimacy boundaries so nothing strands in creator_notes). No duplicate adjectives. DO NOT RESTATE: physical appearance or setting.',
  scenario: 'POV: 3rd-person immediate setting, relationship framing, and core scene mechanics / win conditions (include a tell-based or internal tally cue if tracking counts). DO NOT RESTATE: appearance or full backstory.',
  first_mes: 'POV: in-character opening as {{char}} ("double-quoted dialogue" + *single-asterisk actions*). STRICTLY NEVER narrate {{user}}\'s actions, speech, arrival, or choices. Banned: multi-<START>, User: labels.',
  mes_example: 'POV: {{user}}:/{{char}}: uniform "double-quoted dialogue" + *single-asterisk actions* across 3 blocks: Baseline/Public -> Private/Core dynamic -> High stakes/Vulnerability. Never narrate {{user}} inside {{char}}: lines. Banned: three hellos.',
  system_prompt: 'POV: ALWAYS begin with {{original}} on its own line, then concise 2nd-person character continuity, voice/format ("dialogue" + *actions*), and rule/boundary enforcement using {{char}}. DO NOT RESTATE: full appearance/backstory from description or full setting from scenario. Banned: mid-scene RP, hardcoded character name, unused formatting rules.',
  post_history_instructions: 'POV: ALWAYS begin with {{original}} on its own line, then 1–3 crisp sentences/bullets of ONLY the top 1–3 continuity hooks using {{char}}. DO NOT RESTATE: full bio or full rulebook.',
  creator_notes: 'POV: 3rd-person human notes for other creators/users (usage tips, pacing notes, content warnings). Banned: {{user}}/{{char}} macros, in-character speech, or any behavioral rule missing from personality/scenario/system_prompt.',
  tags: 'Output 5–12 comma-separated lowercase deduplicated tags (use spaces, not hyphens, inside multi-word tags like "slow burn, monster girl"). Include defining traits/genre, dedupe near-synonyms.',
  name: 'Character display name only.',
  nickname: 'Short substitute name for {{char}} substitution ONLY when name has titles/prefixes; else empty.',
  alternate_greetings: 'Output EXACTLY 3 distinct full openers separated by <START> alone on its own line (no JSON, no array brackets), using "dialogue" + *actions*. Each MUST differ from first_mes AND each other in at least 2 of: location, relationship stage, or power dynamic. NEVER narrate {{user}}\'s actions or prior choices. If an alternate changes the scenario\'s binding/setting, include one short carryover sentence explaining how the core dynamic/rules still apply.',
  group_only_greetings: 'Output 1–3 group-chat openers acknowledging other characters ("dialogue" + *actions*), separated by <START> alone on its own line (no JSON); never narrate {{user}}; or empty.',
  source: 'Source URL strings if known.',
  creator: 'Creator handle if known.',
  character_version: 'Version string if useful.',
};
/** Must exceed sum of bible budgets (~9.5k chars ~ 2.4k tokens) + JSON escaping overhead. */
const CARD_JSON_MAX_TOKENS = 8192;
const PROMPT_VAR_MAX_TOKENS = 512;
const PROMPT_ALL_VARS_MAX_TOKENS = 2048;
const RAW_CONTEXT_MAX_CHARS = 120_000;
/** Every provider gets a ceiling (whole-card JSON gets extra headroom for OneProvider/long outputs). */
const PROVIDER_TIMEOUT_MS = 45_000;
const WHOLE_CARD_TIMEOUT_MS = 90_000;
const VENICE_STALL_MS = 40_000;
const VENICE_MAX_WALL_MS = 110_000;
const VENICE_MAX_ATTEMPTS = 2;
const VENICE_RETRY_BASE_MS = 700;
const VENICE_PARAMETERS = {
  include_venice_system_prompt: false,
  disable_thinking: true,
  strip_thinking_response: true,
};
/* ============================================================
   PROVIDERS  (Venice, OpenRouter, OneProvider)
   ============================================================ */
type ProviderId = 'venice' | 'openrouter' | 'oneprovider';
const PROVIDER_ENV: Record<ProviderId, string> = {
  venice: 'VENICE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  oneprovider: 'ONEPROVIDER_API_KEY',
};
const PROVIDER_URL: Record<ProviderId, string> = {
  venice: 'https://api.venice.ai/api/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  oneprovider: 'https://api.oneprovider.dev/v1/chat/completions',
};
const PROVIDER_MODELS_URL: Record<ProviderId, string> = {
  venice: 'https://api.venice.ai/api/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  oneprovider: 'https://api.oneprovider.dev/v1/models',
};
/**
 * SEED model lists. These are IDs already present in this codebase and are
 * meant only as a fallback before `list-models` populates the real catalog.
 * DO NOT treat as authoritative — fetch live and cache client-side (24h).
 */
const SEED_MODELS: Record<ProviderId, string[]> = {
  venice: ['z-ai-glm-5-3-flash'],
  openrouter: [
    'cognitivecomputations/dolphin-mistral-24b-venice-edition',
    'sao10k/l3.3-euryale-70b',
    'gryphe/mythomax-l2-13b',
    'google/gemma-4-31b-it:free',
  ],
  oneprovider: ['grok-4.7', 'glm-5.3-flash', 'deepseek-v4.1-flash-1017'],
};
const DEFAULT_PROVIDER_MODEL: Record<ProviderId, string> = {
  venice: 'z-ai-glm-5-3-flash',
  openrouter: 'cognitivecomputations/dolphin-mistral-24b-venice-edition',
  oneprovider: 'grok-4.7',
};
/** Providers whose API is known to accept response_format json_object. */
const PROVIDER_JSON_MODE: Record<ProviderId, boolean> = {
  venice: true,
  openrouter: true,
  oneprovider: false,
};
const OPENROUTER_HEADERS: Record<string, string> = {
  'HTTP-Referer': 'https://companionhub.app',
  'X-Title': 'AI Companion Hub',
};
/* ---------- key + model resolution (simple path vs BYOK path) ---------- */
interface ResolvedProvider {
  id: ProviderId;
  key: string;
  isByok: boolean;
  models: string[];
}
function normalizeByok(body: Record<string, unknown>): Partial<Record<ProviderId, string>> {
  const out: Partial<Record<ProviderId, string>> = {};
  const raw = body.byok;
  if (raw && typeof raw === 'object') {
    const b = raw as Record<string, unknown>;
    for (const id of Object.keys(PROVIDER_ENV) as ProviderId[]) {
      const v = b[id];
      if (typeof v === 'string' && v.trim()) out[id] = v.trim();
    }
  }
  // legacy alias: Lineage A sent { openrouterKey }
  if (!out.openrouter && typeof body.openrouterKey === 'string' && body.openrouterKey.trim()) {
    out.openrouter = body.openrouterKey.trim();
  }
  return out;
}
function normalizeModels(body: Record<string, unknown>): Record<ProviderId, string[]> {
  const out = { venice: [] as string[], openrouter: [] as string[], oneprovider: [] as string[] };
  const raw = body.models;
  if (raw && typeof raw === 'object') {
    const m = raw as Record<string, unknown>;
    for (const id of Object.keys(out) as ProviderId[]) {
      const v = m[id];
      if (typeof v === 'string' && v.trim()) out[id] = [v.trim()];
      else if (Array.isArray(v)) out[id] = v.filter((x): x is string => typeof x === 'string' && !!x.trim());
    }
  }
  // legacy alias: Lineage A sent { openrouterModel }
  if (out.openrouter.length === 0 && typeof body.openrouterModel === 'string' && body.openrouterModel.trim()) {
    out.openrouter = [body.openrouterModel.trim()];
  }
  return out;
}
/**
 * Build the ordered provider attempt list.
 *  - If the visitor supplied ANY key, only visitor providers are used, unless
 *    allowSharedFallback is explicitly true. (Q1)
 *  - preferredProvider (when keyed) goes first; otherwise Venice -> OpenRouter -> OneProvider.
 */
function resolveProviders(body: Record<string, unknown>): ResolvedProvider[] {
  const byok = normalizeByok(body);
  const models = normalizeModels(body);
  const byokActive = Object.keys(byok).length > 0;
  const allowShared = body.allowSharedFallback === true;
  const order: ProviderId[] = ['venice', 'openrouter', 'oneprovider'];
  const preferred = typeof body.preferredProvider === 'string' ? body.preferredProvider as ProviderId : null;
  if (preferred && order.includes(preferred)) {
    order.splice(order.indexOf(preferred), 1);
    order.unshift(preferred);
  }
  const resolved: ResolvedProvider[] = [];
  for (const id of order) {
    const byokKey = byok[id];
    const serverKey = Deno.env.get(PROVIDER_ENV[id]) ?? '';
    const isByok = !!byokKey;
    if (byokActive && !allowShared && !isByok) continue;
    const key = byokKey || serverKey;
    if (!key) continue;
    const list = models[id].length ? models[id] : [DEFAULT_PROVIDER_MODEL[id]];
    resolved.push({ id, key, isByok, models: list });
  }
  return resolved;
}
/* ============================================================
   TEXT / JSON UTILITIES
   ============================================================ */
function joinStringOrArray(value: unknown, sep = ', '): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean).join(sep);
  if (value == null) return '';
  return String(value);
}
function stripThinkingBlocks(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/ thinking[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}
function repairJsonString(input: string): string {
  if (!input || typeof input !== 'string') return '{}';
  let str = input.trim();
  str = str.replace(/,\s*([}\]])/g, '$1');
  const chars = Array.from(str);
  const result: string[] = [];
  let inString = false, isKey = false, isEscaped = false;
  const stack: ('{' | '[')[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (inString) {
      if (isEscaped) { result.push(ch); isEscaped = false; continue; }
      if (ch === '\\') { result.push(ch); isEscaped = true; continue; }
      if (ch === '\n') { result.push('\\n'); continue; }
      if (ch === '\r') continue;
      if (ch === '\t') { result.push('\\t'); continue; }
      if (ch === '"') {
        let nextNonWs = '';
        for (let j = i + 1; j < chars.length; j++) { if (!/\s/.test(chars[j])) { nextNonWs = chars[j]; break; } }
        if (isKey) {
          if (nextNonWs === ':') { inString = false; isKey = false; result.push(ch); } else result.push('\\"');
        } else {
          if (nextNonWs === ',' || nextNonWs === '}' || nextNonWs === ']' || nextNonWs === '' || nextNonWs === ':') {
            inString = false; result.push(ch);
          } else result.push('\\"');
        }
        continue;
      }
      result.push(ch);
    } else {
      if (ch === '"') {
        inString = true;
        let prevNonWs = '';
        for (let j = i - 1; j >= 0; j--) { if (!/\s/.test(chars[j])) { prevNonWs = chars[j]; break; } }
        const top = stack.length > 0 ? stack[stack.length - 1] : null;
        isKey = top === '{' && (prevNonWs === '{' || prevNonWs === ',');
        result.push(ch);
      } else if (ch === '{') { stack.push('{'); result.push(ch); }
      else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); result.push(ch); }
      else if (ch === '[') { stack.push('['); result.push(ch); }
      else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); result.push(ch); }
      else result.push(ch);
    }
  }
  let repaired = result.join('');
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  while (stack.length > 0) { const top = stack.pop(); repaired += top === '{' ? '}' : ']'; }
  return repaired;
}
function extractCardFieldsFuzzy(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  const text = stripThinkingBlocks(raw);
  const result: Record<string, unknown> = {};
  for (const field of CARD_FIELD_ORDER) {
    const arrayMatch = new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'i').exec(text);
    if (arrayMatch) {
      const items: string[] = [];
      const itemRegex = /"((?:\\.|[^"\\])*)"/g;
      let m: RegExpExecArray | null;
      while ((m = itemRegex.exec(arrayMatch[1])) !== null) {
        items.push(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
      }
      if (items.length > 0 || ARRAY_CARD_FIELDS.has(field)) { result[field] = items; continue; }
    }
    const multilineMatch = new RegExp(
      `"${field}"\\s*:\\s*"([\\s\\S]*?)(?="\\s*,\\s*"[a-zA-Z0-9_-]+"\\s*:|"\\s*})`, 'i',
    ).exec(text);
    if (multilineMatch) {
      result[field] = multilineMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').trim();
      continue;
    }
    const strMatch = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i').exec(text);
    if (strMatch) {
      result[field] = strMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').trim();
      continue;
    }
  }
  return Object.keys(result).length >= 2 ? result : null;
}
function parseWholeCardJson(raw: string): { card: Record<string, unknown> | null; parseError: boolean } {
  if (!raw || typeof raw !== 'string') return { card: null, parseError: true };
  let text = stripThinkingBlocks(raw.trim());
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) text = text.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { card: parsed as Record<string, unknown>, parseError: false };
  } catch { /* tier 2 */ }
  try {
    const parsed = JSON.parse(repairJsonString(text));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { card: parsed as Record<string, unknown>, parseError: false };
  } catch { /* tier 3 */ }
  const fuzzy = extractCardFieldsFuzzy(raw);
  if (fuzzy && Object.keys(fuzzy).length > 0) return { card: fuzzy, parseError: false };
  return { card: null, parseError: true };
}
function looksLikeTruncatedCardJson(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return true;
  const t = raw.trim();
  if (!t.includes('{')) return true;
  const opens = (t.match(/\{/g) || []).length;
  const closes = (t.match(/\}/g) || []).length;
  if (closes < opens) return true;
  if (!/\}\s*$/.test(t) && !/```\s*$/.test(t)) return true;
  return false;
}
/** R8: a repaired-but-incomplete card is a FAILURE, not a success. */
function wholeCardCompletenessError(card: Record<string, unknown>, raw: string): string | null {
  const required = ['name', 'description', 'personality', 'first_mes'];
  const missing = required.filter((k) => !String(card[k] ?? '').trim());
  if (missing.length > 0) return `incomplete card JSON — empty: ${missing.join(', ')} (${raw.length} chars)`;
  if (looksLikeTruncatedCardJson(raw)) return `truncated/incomplete JSON (${raw.length} chars)`;
  return null;
}
/* ---------- sanitization (R7) — mirrors src/lib/cardAiFormat.ts ---------- */
function normalizeCardTags(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const part of raw.split(/[,\n;]+/)) {
    const tag = part
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    cleaned.push(tag);
    if (cleaned.length >= 12) break;
  }
  return cleaned.join(', ');
}
function ensureOriginalMacro(text: string): string {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return '';
  if (/\{\{\s*original\s*\}\}/i.test(trimmed)) {
    return trimmed.replace(/\{\{\s*original\s*\}\}/gi, '{{original}}');
  }
  return `{{original}}\n${trimmed}`;
}
function replaceLiteralCharName(text: string, charName: string): string {
  if (!text) return text;
  const name = (charName || '').trim();
  if (name.length < 2) return text;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = text.replace(new RegExp(`\\b${esc}(['’]s)\\b`, 'gi'), "{{char}}'s");
  out = out.replace(new RegExp(`\\b${esc}\\b`, 'gi'), '{{char}}');
  return out;
}
function sanitizeCreatorNotes(text: string, charName = ''): string {
  if (!text) return text;
  const name = charName.trim() || 'the character';
  let out = text;
  out = out.replace(/\{\{\s*user['’]?s\s*\}\}/gi, "the user's");
  out = out.replace(/\{\{\s*user\s*\}\}['’]s/gi, "the user's");
  out = out.replace(/\{\{\s*user\s*\}\}/gi, 'the user');
  out = out.replace(/\{\{\s*char['’]?s\s*\}\}/gi, `${name}'s`);
  out = out.replace(/\{\{\s*char\s*\}\}['’]s/gi, `${name}'s`);
  out = out.replace(/\{\{\s*char\s*\}\}/gi, name);
  return out;
}
function sanitizeCardText(text: string, fieldName?: string, charName = ''): string {
  if (!text) return text;
  if (fieldName === 'creator_notes') return sanitizeCreatorNotes(text, charName);
  let out = text;
  out = out.replace(/\{\{\s*User\s*\}\}/g, '{{user}}');
  out = out.replace(/\{\{\s*Char\s*\}\}/g, '{{char}}');
  out = out.replace(/\{\{\s*USER\s*\}\}/g, '{{user}}');
  out = out.replace(/\{\{\s*CHAR\s*\}\}/g, '{{char}}');
  out = out.replace(/\{\{\s*original\s*\}\}/gi, '{{original}}');
  out = out.replace(/\{\{\s*User'?s\s*\}\}/gi, "{{user}}'s");
  out = out.replace(/\{\{\s*user'?s\s*\}\}/g, "{{user}}'s");
  out = out.replace(/\{\{\s*Char'?s\s*\}\}/gi, "{{char}}'s");
  out = out.replace(/\{\{\s*char'?s\s*\}\}/g, "{{char}}'s");
  out = out.replace(/\bThe User\b/g, '{{user}}');
  out = out.replace(/\bthe User\b/g, '{{user}}');
  out = out.replace(/\bthe user's\b/gi, "{{user}}'s");
  out = out.replace(/\bthe user\b/gi, '{{user}}');
  out = out.replace(/(^|\n)\s*User\s*:/g, '$1{{user}}:');
  out = out.replace(/(^|\n)\s*Name\s*:/g, '$1{{char}}:');
  if (fieldName === 'description' || fieldName === 'personality') {
    out = out.replace(/^(\s*)You are\b/i, '$1{{char}} is');
  }
  return out;
}
function findUserNarrationViolation(text: string, fieldKey: string): string | null {
  if (!text) return null;
  const greetingFields = new Set(['first_mes', 'alternate_greetings', 'group_only_greetings', 'mes_example']);
  if (!greetingFields.has(fieldKey)) return null;
  const scanText = fieldKey === 'mes_example'
    ? text
        .split('\n')
        .filter((line) => !/^\s*\{\{user\}\}\s*:/i.test(line))
        .join('\n')
    : text;
  const patterns = [
    /\b(?:watching|sees?|watches?|as)\s+\{\{user\}\}\s+(?:light|lights|draw|draws|walk|walks|step|steps|enter|enters|open|opens|close|closes|reach|reaches|touch|touches|say|says|speak|speaks|nod|nods|sit|sits|stand|stands|grab|grabs|pull|pulls|push|pushes|turn|turns|drop|drops)\b[^.!?\n]*/i,
    /\{\{user\}\}\s+(?:lights|walks|steps|enters|opens|reaches|nods|smiles|laughs|says|speaks|sits|stands|grabs|pulls|pushes|turns|drops|takes|puts|hands|places)\b[^.!?\n]*/i,
    /"[^"]*\bYou\s+(?:came\s+home|walked\s+in|stepped\s+in|just\s+walked|just\s+got\s+back)\b[^"]*"/i,
  ];
  for (const re of patterns) {
    const m = scanText.match(re);
    if (m) return m[0].trim().slice(0, 140);
  }
  return null;
}
function rewriteSpeakerLabels(text: string, charName: string): string {
  if (!text) return text;
  let out = text.replace(/(^|\n)\s*User\s*:/g, '$1{{user}}:');
  const name = (charName || '').trim();
  if (!name) return out;
  const variants = new Set<string>([name]);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) { variants.add(parts[0]); variants.add(parts[parts.length - 1]); }
  for (const variant of variants) {
    const esc = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('(^|\\n)\\s*' + esc + '\\s*:', 'gi'), '$1{{char}}:');
  }
  return out;
}
function sanitizeWholeCardFields(card: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...card };
  const charName = joinStringOrArray(out.name).trim();
  for (const key of CARD_FIELD_ORDER) {
    if (!(key in out)) continue;
    const value = out[key];
    if (typeof value === 'string') out[key] = sanitizeCardText(value, key, charName);
    else if (Array.isArray(value)) out[key] = value.map((v) => (typeof v === 'string' ? sanitizeCardText(v, key, charName) : v));
  }
  return out;
}
function normalizeWholeCardToHub(card: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return {};
  let root: Record<string, unknown> = { ...card };
  const wrapped = root.character_card;
  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) root = { ...(wrapped as Record<string, unknown>) };
  const dataObj = root.data;
  const dataRec = dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj) ? (dataObj as Record<string, unknown>) : null;
  const dataLooksLikeCard = !!(dataRec && (
    typeof dataRec.name === 'string' || typeof dataRec.description === 'string' ||
    typeof dataRec.personality === 'string' || typeof dataRec.first_mes === 'string'
  ));
  const merged: Record<string, unknown> = { ...root };
  if (dataLooksLikeCard && dataRec) {
    for (const key of CARD_FIELD_ORDER) {
      if (key in dataRec && dataRec[key] !== undefined && dataRec[key] !== null) merged[key] = dataRec[key];
    }
  }
  if (Array.isArray(merged.personality)) merged.personality = joinStringOrArray(merged.personality, ', ');
  if (Array.isArray(merged.tags)) merged.tags = joinStringOrArray(merged.tags, ', ');
  const charName = joinStringOrArray(merged.name).trim();
  const result: Record<string, unknown> = {};
  for (const key of CARD_FIELD_ORDER) {
    if (!(key in merged) || merged[key] === undefined) { result[key] = ARRAY_CARD_FIELDS.has(key) ? [] : ''; continue; }
    let value = merged[key];
    if (key === 'personality' || key === 'tags') value = joinStringOrArray(value, ', ');
    else if (ARRAY_CARD_FIELDS.has(key)) {
      if (typeof value === 'string') { const t = value.trim(); value = t ? [t] : []; }
      else if (!Array.isArray(value)) value = value == null ? [] : [String(value)];
      else value = value.map((v) => String(v ?? ''));
    } else if (typeof value !== 'string' && !Array.isArray(value)) value = value == null ? '' : String(value);
    if (key === 'mes_example' || key === 'first_mes') value = rewriteSpeakerLabels(String(value ?? ''), charName);
    else if ((key === 'alternate_greetings' || key === 'group_only_greetings') && Array.isArray(value)) value = value.map((v) => rewriteSpeakerLabels(String(v ?? ''), charName));
    if (typeof value === 'string') value = sanitizeCardText(value, key, charName);
    else if (Array.isArray(value)) value = value.map((v) => (typeof v === 'string' ? sanitizeCardText(v, key, charName) : v));
    if (key === 'tags' && typeof value === 'string') value = normalizeCardTags(value);
    else if ((key === 'system_prompt' || key === 'post_history_instructions') && typeof value === 'string' && value.trim()) {
      value = ensureOriginalMacro(replaceLiteralCharName(value, charName));
    }
    result[key] = value;
  }
  return result;
}
function extractCardField(card: Record<string, unknown>, fieldName: string): unknown {
  if (!card || typeof card !== 'object') return undefined;
  if (fieldName in card) return card[fieldName];
  const data = card.data;
  if (data && typeof data === 'object' && !Array.isArray(data) && fieldName in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)[fieldName];
  }
  return undefined;
}
function formatExistingFieldValue(value: unknown, fieldKey?: string): string | null {
  if (typeof value === 'string') { const t = value.trim(); return t ? t : null; }
  if (Array.isArray(value)) {
    const parts = value.map((v) => String(v).trim()).filter(Boolean);
    if (!parts.length) return null;
    if (fieldKey === 'source') return parts.join(', ');
    return parts.map((p) => `<START>\n${p}`).join('\n\n');
  }
  return null;
}
type FieldPolicyMap = Record<string, { locked?: boolean; useAsContext?: boolean }> | null | undefined;
function collectContextParts(
  existingFields: Record<string, unknown> | null | undefined,
  fieldOrder?: string[],
  excludeField?: string,
): string[] {
  const contextParts: string[] = [];
  if (!existingFields || typeof existingFields !== 'object') return contextParts;
  const keys = fieldOrder && fieldOrder.length ? fieldOrder : Object.keys(existingFields);
  for (const key of keys) {
    if (excludeField && key === excludeField) continue;
    const formatted = formatExistingFieldValue(existingFields[key], key);
    if (formatted) contextParts.push(`${key}: ${formatted}`);
  }
  if (fieldOrder) {
    for (const [key, value] of Object.entries(existingFields)) {
      if (fieldOrder.includes(key) || (excludeField && key === excludeField)) continue;
      const formatted = formatExistingFieldValue(value, key);
      if (formatted) contextParts.push(`${key}: ${formatted}`);
    }
  }
  return contextParts;
}
function collectTieredContext(
  existingFields: Record<string, unknown> | null | undefined,
  fieldPolicies: FieldPolicyMap,
  fieldOrder: string[],
  excludeField?: string,
): { tierA: string[]; tierB: string[]; hasPolicies: boolean } {
  const tierA: string[] = [];
  const tierB: string[] = [];
  if (!existingFields || typeof existingFields !== 'object') return { tierA, tierB, hasPolicies: false };
  const hasPolicies = !!(fieldPolicies && typeof fieldPolicies === 'object' && Object.keys(fieldPolicies).length > 0);
  const allKeys = [...fieldOrder, ...Object.keys(existingFields).filter((k) => !fieldOrder.includes(k))];
  for (const key of allKeys) {
    if (excludeField && key === excludeField) continue;
    const policy = hasPolicies ? fieldPolicies?.[key] : undefined;
    if (policy && policy.useAsContext === false) continue;
    const formatted = formatExistingFieldValue(existingFields[key], key);
    if (!formatted) continue;
    if (policy?.locked === true) {
      tierA.push(`[LOCKED ANCHOR] ${key}: ${formatted}`);
    } else {
      tierB.push(`${hasPolicies ? '[RAW SEED] ' : ''}${key}: ${formatted}`);
    }
  }
  return { tierA, tierB, hasPolicies };
}
function formatTieredContextBlock(
  existingFields: Record<string, unknown> | null | undefined,
  fieldPolicies: FieldPolicyMap,
  emptyLabel: string,
  excludeField?: string,
): string {
  const { tierA, tierB, hasPolicies } = collectTieredContext(existingFields, fieldPolicies, CARD_FIELD_ORDER, excludeField);
  const sections: string[] = [];
  if (tierA.length > 0) {
    sections.push(`TIER A — AUTHORITATIVE CARD ANCHORS (Locked — MUST NOT be contradicted):\n${tierA.join('\n\n')}`);
  }
  if (tierB.length > 0) {
    sections.push(
      hasPolicies
        ? `TIER B — SEED / SOURCE MATERIAL (Unlocked — extract facts/voice; discard raw dump formatting/wording):\n${tierB.join('\n\n')}`
        : `LABELED CURRENT CARD CONTEXT (non-empty fields):\n${tierB.join('\n\n')}`,
    );
  }
  return sections.length > 0 ? sections.join('\n\n') : emptyLabel;
}
/* ============================================================
   COMPANION BRIEF (section 10)
   ============================================================ */
function buildBriefBlock(brief: unknown): string {
  if (!brief || typeof brief !== 'object') return '';
  const b = brief as Record<string, unknown>;
  const get = (k: string) => (typeof b[k] === 'string' ? String(b[k]).trim() : '');
  const level = Number(b.contentLevel);
  const levelLine =
    level === 1 ? 'Content level 1 (SFW): keep all intimacy implied; no explicit language.'
    : level === 2 ? 'Content level 2: light innuendo permitted; nothing graphic.'
    : level === 3 ? 'Content level 3: moderate — suggestive is fine, stop at the curtain.'
    : level === 4 ? 'Content level 4: explicit language permitted when the scene earns it; never gratuitous.'
    : level === 5 ? 'Content level 5: uncensored permitted; still driven by character, never shock for its own sake.'
    : '';
  const rows = ([
    ['Setting / genre', get('setting')],
    ['Role / occupation', get('role')],
    ['Age presentation', get('agePresentation')],
    ['Tone register', get('tone')],
    ['Target reply length', get('replyLength')],
    ['Relationship with {{user}}', get('relationship')],
    ['POV / tense', get('pov')],
    ['Language', get('language')],
    ['Must include', get('mustInclude')],
    ['Never use', get('bannedPhrases')],
  ] as [string, string][]).filter(([, v]) => v);
  const sample = get('voiceSample');
  if (!rows.length && !sample && !levelLine) return '';
  const lines = ["COMPANION BRIEF (authoritative — this is the creator's intent):"];
  for (const [k, v] of rows) lines.push(`- ${k}: ${v}`);
  if (levelLine) lines.push(`- ${levelLine}`);
  if (sample) {
    lines.push('');
    lines.push('VOICE SAMPLE — imitate this cadence, rhythm and restraint. Do not copy the content:');
    lines.push(sample);
  }
  return lines.join('\n');
}
/* ============================================================
   PROMPT BUILDERS
   ============================================================ */
function fieldBibleLine(fieldName: string): string {
  const hit = CARD_FIELD_BIBLE.split('\n').find((l) => l.trim().startsWith(`- ${fieldName}:`));
  return hit ? hit.trim() : `- ${fieldName}: follow CCV2/V3 field bible.`;
}
function buildSingleFieldUserPrompt(
  fieldName: string,
  existingFields: Record<string, unknown> | null | undefined,
  isV3: boolean,
  fieldPolicies?: FieldPolicyMap,
): string {
  const contextBlock = formatTieredContextBlock(
    existingFields,
    fieldPolicies,
    'No other fields filled — work from the field name and whatever the companion brief provides.',
    fieldName,
  );
  const policy = fieldPolicies?.[fieldName];
  const targetSeed =
    policy?.locked !== true && policy?.useAsContext !== false
      ? formatExistingFieldValue(existingFields?.[fieldName], fieldName)
      : null;
  const targetSeedBlock = targetSeed
    ? `\nTARGET FIELD RAW SEED for "${fieldName}" (extract facts/intent, discard raw dump structure, and rewrite cleanly in proper "${fieldName}" format — do NOT echo wording verbatim):\n${targetSeed}\n`
    : '';
  const pov = FIELD_POV_SNIPPETS[fieldName] || 'Follow the field bible for this key.';
  return `FRESH STATELESS TASK: Write ONLY the "${fieldName}" field for this CCV2/CCV3 character card from the context below.
${CARD_FIELD_BIBLE}
${FIELD_POV_CONTRACT}
${VOICE_ANCHOR_RULES}
${RELATIONAL_PHRASING_RULES}
${fieldName === 'mes_example' ? MES_EXAMPLE_FORMAT_RULES + '\n\n' : ''}TARGET FIELD: ${fieldName}
FIELD BIBLE: ${fieldBibleLine(fieldName)}
${pov}
${contextBlock}${targetSeedBlock}
TASK: Write ONLY the text for "${fieldName}". Respect Tier A Locked Anchors; extract facts from Tier B seeds without copying dump structure. Stay consistent with Voice Anchor + POV.
MACRO RULES: lowercase {{user}}/{{char}} only; {{user}}'s not {{User's}}; no The User; no User:/Name: labels.
${isV3 ? 'V3 card context.' : 'V2-flat card context.'}
Respond with ONLY the field text, no JSON, no fences, no commentary.`;
}
function buildRefinementFieldPrompt(
  fieldName: string, currentValue: string, notes: string,
  existingFields: Record<string, unknown> | null | undefined, isV3: boolean,
  fieldPolicies?: FieldPolicyMap,
): string {
  const contextBlock = formatTieredContextBlock(
    existingFields,
    fieldPolicies,
    'No other fields filled.',
    fieldName,
  );
  const pov = FIELD_POV_SNIPPETS[fieldName] || 'Follow the field bible for this key.';
  return `FRESH STATELESS TASK: Revise ONLY the "${fieldName}" field draft per the creator critique.
${CARD_FIELD_BIBLE}
${FIELD_POV_CONTRACT}
${VOICE_ANCHOR_RULES}
${RELATIONAL_PHRASING_RULES}
${fieldName === 'mes_example' ? MES_EXAMPLE_FORMAT_RULES + '\n\n' : ''}TARGET FIELD: ${fieldName}
FIELD BIBLE: ${fieldBibleLine(fieldName)}
${pov}
CREATOR CRITIQUE / NOTES (MANDATORY DIRECTIVE PRIORITY):
${notes}
MANDATORY DIRECTIVE PRIORITY:
- The critique ABOVE overrides any conflicting part of the CURRENT DRAFT below.
- You MUST actively modify the draft to satisfy the critique. Do NOT copy the draft unchanged when notes conflict.
- Preservation applies ONLY to parts that do NOT conflict with the notes.
- Address every actionable point in the critique.
CURRENT DRAFT of "${fieldName}":
${currentValue}
${contextBlock}
OUTPUT RULES:
- Keep the same field type/format (mes_example still exactly three <START> Ali:Chat blocks with {{user}}:/{{char}}:; first_mes stays a single opener; alternate_greetings uses <START> separators).
- Stay consistent with Voice Anchor + POV + relational phrasing + macro rules.
- MACRO RULES: lowercase {{user}}/{{char}} only; {{user}}'s not {{User's}}; no The User / the user; no User:/Name: labels.
${isV3 ? '- V3 card context.' : '- V2-flat card context.'}
Respond with ONLY the revised field text, no JSON, no fences, no commentary.`;
}
function buildWholeCardUserPrompt(
  existingFields: Record<string, unknown> | null | undefined,
  isV3: boolean,
  fieldPolicies?: FieldPolicyMap,
): string {
  const contextBlock = formatTieredContextBlock(
    existingFields,
    fieldPolicies,
    'No fields filled — create a completely original character from scratch.',
  );
  return `FRESH STATELESS TASK: Author or reorganize a complete CCV2/CCV3 character card JSON object.
${CARD_FIELD_BIBLE}
${MES_EXAMPLE_FORMAT_RULES}
TASK: Build a COMPLETE proper Character Card as a single JSON object with these keys:
${CARD_FIELD_ORDER.join(', ')}
${contextBlock}
REASONING ORDER: name/nickname -> description -> personality -> scenario -> first_mes -> mes_example -> alternate_greetings -> group_only_greetings -> system_prompt -> post_history_instructions -> creator_notes -> tags -> source/creator/version.
CONTEXT RULES:
- Respect Tier A Locked Anchors verbatim — never contradict them.
- For Tier B Seed / Source Material, extract facts/character DNA and redistribute misplaced details into the proper fields; discard raw JSON/W++/dump wrappers.
OUTPUT RULES:
- Respond with VALID JSON ONLY (no markdown fences, no commentary).
- mes_example must be a single string with real newlines and exactly three <START> blocks.
- alternate_greetings must be an array of exactly 3 strings differing in power dynamic, relationship stage, or location.
- group_only_greetings must be an array (1-3 strings; [] if not useful).
- source must be an array of strings (or []).
- Respect every length budget above — you MUST finish the object. Truncation is a hard failure.
- Personality = {{char}} traits only (~10 consolidated descriptors max). Never {{user}} first-person in personality/description/etc.
- system_prompt = global role/baseline directives FOR the chat model; keep distinct from post_history_instructions.
${isV3 ? '- Prefer V3 list fields (source, group_only_greetings) as arrays.' : '- Include group_only_greetings as an array when useful; otherwise [].'}`;
}
function buildRefineAllAppendix(notes: string): string {
  return `
REFINE-ALL MODE (DELTA — critique-first; do NOT invent a brand-new unrelated character):
CREATOR CRITIQUE / NOTES (MANDATORY DIRECTIVE PRIORITY):
${notes}
MANDATORY DIRECTIVE PRIORITY:
- The critique ABOVE overrides any conflicting parts of the LABELED CURRENT CARD TEXT draft.
- You MUST actively modify fields to satisfy the critique. Do NOT copy the draft unchanged when notes conflict.
- Preservation applies ONLY to parts that do NOT conflict with the notes.
PRESERVATION (non-conflicting only):
- Keep flat Hub JSON schema + POV/Voice Anchor/relational phrasing contracts above.
- Still return complete flat JSON for every key (use "" or [] when empty).
- first_mes remains a single opener; mes_example remains three progression <START> blocks with {{user}}:/{{char}}: only.`;
}
/* ============================================================
   TRANSPORT
   ============================================================ */
function sleepMs(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
function isRetryable(msg: string): boolean {
  return /stall|hung|timeout|wall|network|connection|abort|fetch|5\d\d|429|rate.?limit|truncated|incomplete|invalid JSON|returned empty/i.test(msg);
}
function clarifyFailure(provider: string, msg: string): string {
  if (/429|rate.?limit/i.test(msg)) return `${provider}: rate-limited (429)`;
  if (/returned empty|\(0 chars\)/i.test(msg)) return `${provider}: returned empty (0 chars)`;
  if (/truncated|incomplete JSON/i.test(msg)) return `${provider}: truncated/incomplete JSON`;
  if (/40[13]|unauthor|invalid.?key/i.test(msg)) return `${provider}: rejected the API key`;
  return `${provider}: ${msg}`;
}
function formatCascadeFailure(kind: 'whole-card' | 'generic', failures: string[]): string {
  const joined = failures.join(' | ');
  return kind === 'whole-card'
    ? `All LLM providers failed whole-card JSON. ${joined}`
    : `All LLM providers failed. ${joined}`;
}
/** Venice streaming with stall + wall-clock watchdog. */
async function callVeniceStreaming(
  apiKey: string, model: string, systemPrompt: string, userPrompt: string,
  maxTokens: number, temperature: number, jsonMode = false,
): Promise<string> {
  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
    stream: true,
    venice_parameters: VENICE_PARAMETERS,
  };
  if (jsonMode && PROVIDER_JSON_MODE.venice) payload.response_format = { type: 'json_object' };
  const controller = new AbortController();
  const started = Date.now();
  let lastChunkAt = started;
  let settled = false;
  const watchdog = setInterval(() => {
    if (settled) return;
    const now = Date.now();
    if (now - started > VENICE_MAX_WALL_MS) { settled = true; controller.abort('wall'); return; }
    if (now - lastChunkAt > VENICE_STALL_MS) { settled = true; controller.abort('stall'); }
  }, 1000);
  let response: Response;
  try {
    response = await fetch(PROVIDER_URL.venice, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearInterval(watchdog);
    if (controller.signal.aborted) {
      const reason = String(controller.signal.reason || '');
      if (reason.includes('wall')) throw new Error(`hung: wall clock exceeded ${VENICE_MAX_WALL_MS}ms`);
      throw new Error(`hung: no chunk for ${VENICE_STALL_MS}ms (stall before headers)`);
    }
    throw e;
  }
  if (!response.ok) {
    clearInterval(watchdog);
    console.error('Venice API error:', await response.text());
    throw new Error(`LLM API error: ${response.status}`);
  }
  if (!response.body) { clearInterval(watchdog); throw new Error('hung: empty Venice stream body'); }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', content = '', sawChunk = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lastChunkAt = Date.now();
      sawChunk = true;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { settled = true; clearInterval(watchdog); return content; }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length) { content += delta; lastChunkAt = Date.now(); }
          const full = parsed?.choices?.[0]?.message?.content;
          if (!delta && typeof full === 'string' && full.length) { content = full; lastChunkAt = Date.now(); }
        } catch { /* partial JSON */ }
      }
    }
  } catch (e) {
    clearInterval(watchdog);
    if (controller.signal.aborted) {
      const reason = String(controller.signal.reason || '');
      if (reason.includes('wall')) throw new Error(`hung: wall clock exceeded ${VENICE_MAX_WALL_MS}ms after ${content.length} chars`);
      throw new Error(`hung: no chunk for ${VENICE_STALL_MS}ms after ${content.length} chars`);
    }
    throw e;
  } finally {
    settled = true;
    clearInterval(watchdog);
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
  if (!content) throw new Error(sawChunk ? 'hung: stream ended with empty content' : 'hung: connection died with no chunks');
  return content;
}
/** OpenAI-compatible non-streaming call. Timeout ALWAYS applied (R6). */
async function callOpenAiCompatible(
  provider: ProviderId, apiKey: string, model: string, systemPrompt: string, userPrompt: string,
  maxTokens: number, temperature: number, jsonMode: boolean,
): Promise<string> {
  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
  };
  if (provider === 'venice') payload.venice_parameters = VENICE_PARAMETERS;
  if (jsonMode && PROVIDER_JSON_MODE[provider]) payload.response_format = { type: 'json_object' };
  const timeoutMs = maxTokens >= 4096 ? WHOLE_CARD_TIMEOUT_MS : PROVIDER_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(PROVIDER_URL[provider], {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(provider === 'openrouter' ? OPENROUTER_HEADERS : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) throw new Error(`timeout after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    console.error(`${provider} API error:`, await response.text());
    throw new Error(`LLM API error: ${response.status}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content || !String(content).trim()) throw new Error('returned empty (0 chars)');
  return content;
}
interface CascadeOptions {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  jsonMode?: boolean;
  providers: ResolvedProvider[];
  /** Return an error string to reject this attempt and fall through. */
  validate?: (content: string) => string | null;
}
async function runCascade(opts: CascadeOptions): Promise<{ content: string; provider: string }> {
  const failures: string[] = [];
  for (const p of opts.providers) {
    const label = p.id === 'oneprovider' ? 'OneProvider' : p.id === 'openrouter' ? 'OpenRouter' : 'Venice';
    if (p.id === 'venice') {
      veniceLoop: for (let attempt = 1; attempt <= VENICE_MAX_ATTEMPTS; attempt++) {
        for (const model of p.models) {
          try {
            let content: string;
            try {
              content = await callVeniceStreaming(
                p.key, model, opts.system, opts.user, opts.maxTokens, opts.temperature, opts.jsonMode === true,
              );
            } catch (streamErr) {
              const streamMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
              if (/stream ended with empty content|connection died with no chunks/i.test(streamMsg)) {
                console.warn(`Venice SSE returned empty (${model}), falling back to non-streaming call`);
                content = await callOpenAiCompatible(
                  'venice', p.key, model, opts.system, opts.user, opts.maxTokens, opts.temperature, opts.jsonMode === true,
                );
              } else {
                throw streamErr;
              }
            }
            const bad = opts.validate?.(content);
            if (bad) throw new Error(bad);
            return { content, provider: p.isByok ? 'venice-byok' : 'venice' };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`Venice failed (${model}) attempt ${attempt}:`, msg);
            failures.push(clarifyFailure(label, msg));
            if (!isRetryable(msg)) break veniceLoop;
            await sleepMs(VENICE_RETRY_BASE_MS * attempt);
          }
        }
      }
      continue;
    }
    for (const model of p.models) {
      try {
        const content = await callOpenAiCompatible(
          p.id, p.key, model, opts.system, opts.user, opts.maxTokens, opts.temperature, opts.jsonMode === true,
        );
        const bad = opts.validate?.(content);
        if (bad) throw new Error(bad);
        return { content, provider: p.isByok ? `${p.id}-byok` : p.id };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`${label} failed (${model}):`, msg);
        failures.push(clarifyFailure(label, msg));
      }
    }
  }
  if (failures.length === 0) {
    throw new Error('No usable provider keys (set server env keys, or supply a BYOK key).');
  }
  throw new Error(formatCascadeFailure(opts.validate ? 'whole-card' : 'generic', failures));
}
async function callLLMForWholeCard(
  systemPrompt: string, userPrompt: string, providers: ResolvedProvider[],
  maxTokens = CARD_JSON_MAX_TOKENS, temperature = 0.7,
): Promise<{ content: string; provider: string; card: Record<string, unknown> }> {
  const validated = await runCascade({
    system: systemPrompt, user: userPrompt, maxTokens, temperature,
    jsonMode: true, providers,
    validate: (content) => {
      const { card, parseError } = parseWholeCardJson(content);
      if (parseError || !card) {
        return looksLikeTruncatedCardJson(content)
          ? `truncated/incomplete JSON (${content.length} chars)`
          : `invalid JSON (${content.length} chars)`;
      }
      return wholeCardCompletenessError(card, content);
    },
  });
  const { card } = parseWholeCardJson(validated.content);
  if (!card) throw new Error('invalid JSON after validation');
  return { content: validated.content, provider: validated.provider, card };
}
/* ============================================================
   HELPERS
   ============================================================ */
function trimRawContext(raw: unknown, max = RAW_CONTEXT_MAX_CHARS): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
function clampTemperature(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1.2, Math.max(0, n));
}
function cleanFieldText(raw: string, fieldName: string, charName = ''): string {
  let text = stripThinkingBlocks(typeof raw === 'string' ? raw.trim() : '');
  const fence = text.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n?```$/);
  if (fence) text = fence[1].trim();
  if (fieldName === 'mes_example' || fieldName === 'first_mes' || fieldName === 'alternate_greetings' || fieldName === 'group_only_greetings') {
    text = rewriteSpeakerLabels(text, charName);
  }
  text = sanitizeCardText(text, fieldName, charName);
  if (fieldName === 'tags') return normalizeCardTags(text);
  if ((fieldName === 'system_prompt' || fieldName === 'post_history_instructions') && text.trim()) {
    return ensureOriginalMacro(replaceLiteralCharName(text, charName));
  }
  return text;
}
function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
/* ============================================================
   SERVER
   ============================================================ */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { action } = body;
    const briefBlock = buildBriefBlock(body?.brief);
    const providers = resolveProviders(body);
    /* --- HEALTH: report which providers are usable on the SHARED path.
       The client combines this with its own BYOK state to enable AI. --- */
    if (action === 'health') {
      const shared = {
        venice: !!Deno.env.get(PROVIDER_ENV.venice),
        openrouter: !!Deno.env.get(PROVIDER_ENV.openrouter),
        oneprovider: !!Deno.env.get(PROVIDER_ENV.oneprovider),
      };
      const anyShared = shared.venice || shared.openrouter || shared.oneprovider;
      return jsonResponse({
        ok: anyShared,
        shared,
        providers: shared,
        reason: anyShared ? undefined : 'No shared provider key configured. Add a BYOK key to enable AI.',
      });
    }
    /* --- LIST MODELS: live catalog per provider, so the BYOK UI never
       hardcodes a model list (R4). Tolerates per-provider failure. --- */
    if (action === 'list-models') {
      const byok = normalizeByok(body);
      const result: Record<string, unknown> = {};
      for (const id of Object.keys(PROVIDER_ENV) as ProviderId[]) {
        const key = byok[id] || Deno.env.get(PROVIDER_ENV[id]);
        try {
          const headers: Record<string, string> = { 'Accept': 'application/json' };
          if (key) headers['Authorization'] = `Bearer ${key}`;
          if (id === 'openrouter') Object.assign(headers, OPENROUTER_HEADERS);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10_000);
          let res: Response;
          try {
            res = await fetch(PROVIDER_MODELS_URL[id], { headers, signal: controller.signal });
          } finally { clearTimeout(timer); }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const raw = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
          result[id] = raw
            .map((m: Record<string, unknown>) => ({
              id: String(m?.id ?? m?.model_spec?.name ?? ''),
              name: String(m?.name ?? m?.model_spec?.name ?? m?.id ?? ''),
            }))
            .filter((m: { id: string }) => m.id);
        } catch (e) {
          result[id] = { error: e instanceof Error ? e.message : String(e) };
        }
      }
      return jsonResponse({ models: result, seeds: SEED_MODELS, defaults: DEFAULT_PROVIDER_MODEL });
    }
    /* --- FETCH URL --- */
    if (action === 'fetch-url') {
      const { url } = body;
      if (!url || typeof url !== 'string') return jsonResponse({ error: 'url is required' }, 400);
      let parsedUrl: URL;
      try { parsedUrl = new URL(url); } catch { return jsonResponse({ error: 'Invalid URL' }, 400); }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return jsonResponse({ error: 'Only http/https URLs are supported' }, 400);
      }
      const response = await fetch(parsedUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DocConsolidator/1.0; +https://companionhub.app)',
          'Accept': 'text/html,text/plain,application/xhtml+xml,*/*',
        },
        redirect: 'follow',
      });
      if (!response.ok) return jsonResponse({ error: `Failed to fetch URL (HTTP ${response.status})` }, 502);
      const contentType = response.headers.get('content-type') || '';
      const raw = await response.text();
      let text = raw;
      if (contentType.includes('text/html') || raw.trimStart().startsWith('<!doctype') || raw.trimStart().startsWith('<html')) {
        text = raw
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
          .replace(/\s+/g, ' ').trim();
      }
      const truncated = text.length > 32000;
      return jsonResponse({ text: truncated ? text.slice(0, 32000) : text, truncated, url: parsedUrl.toString() });
    }
    /* --- DOC CONSOLIDATOR --- */
    if (action === 'consolidate') {
      const { serviceName, text } = body;
      if (!serviceName || !text) return jsonResponse({ error: 'serviceName and text are required' }, 400);
      const prompt = `Consolidate this documentation into a structured markdown expert file for ${serviceName}. Include:
1. **Overview** - Brief description
2. **Setup Steps** - Step-by-step guide
3. **Character Creation Guide**
4. **API Configuration**
5. **Content Settings**
6. **Features**
7. **Troubleshooting**
Format with clear markdown headings, bullet points, and code blocks. Be comprehensive but concise.
Documentation:
${text}`;
      const { content } = await runCascade({
        system: 'You are a technical documentation specialist. Consolidate raw documentation into clean, structured markdown.',
        user: prompt, maxTokens: 4096, temperature: 0.3, providers,
      });
      const trimmed = content.trim();
      if (!trimmed) return jsonResponse({ error: 'AI returned an empty result' }, 502);
      return jsonResponse({ result: trimmed });
    }
    /* --- GENERATE SINGLE FIELD (targeted plain text; refine DELTA when notes+draft) --- */
    if (action === 'generate-field') {
      const { fieldName, existingFields, specVersion, refinementNotes, currentValue, fieldPolicies } = body;
      if (!fieldName) return jsonResponse({ error: 'fieldName is required' }, 400);
      const isV3 = specVersion === 'v3' || specVersion === 'V3';
      const fieldKey = String(fieldName);
      const notes = typeof refinementNotes === 'string' ? refinementNotes.trim() : '';
      const clientDraft = typeof currentValue === 'string' ? currentValue : '';
      const existingDraft = formatExistingFieldValue(existingFields?.[fieldKey], fieldKey) || '';
      const draft = clientDraft.trim() || existingDraft;
      const useRefine = notes.length > 0 && draft.length > 0;
      const maxTok = FIELD_MAX_TOKENS[fieldKey] ?? 512;
      const temperature = clampTemperature(body.temperature, useRefine ? 0.7 : 0.75);
      const policies = (fieldPolicies && typeof fieldPolicies === 'object' ? fieldPolicies : undefined) as FieldPolicyMap;
      const charName = joinStringOrArray(existingFields?.name).trim();
      const budget = FIELD_CHAR_BUDGETS[fieldKey];
      const finalizeField = async (rawContent: string, basePrompt: string, systemPrompt: string, currentProvider: string) => {
        let cleaned = cleanFieldText(rawContent, fieldKey, charName);
        let activeProvider = currentProvider;
        const narrationHit = findUserNarrationViolation(cleaned, fieldKey);
        const overBudget = typeof budget === 'number' && cleaned.length > Math.round(budget * 1.1);
        if (narrationHit || overBudget) {
          const fixes: string[] = [];
          if (narrationHit) {
            fixes.push(`Remove {{user}} action narration (flagged: "${narrationHit}") — describe ONLY {{char}} and the environment, leaving room for {{user}} to act.`);
          }
          if (overBudget && budget) {
            fixes.push(`Condense from ${cleaned.length} chars to <= ${budget} chars while keeping every concrete fact, boundary, and required format (**Header:** / <START> / {{original}}).`);
          }
          try {
            const repairPrompt = `${basePrompt}\n\nQUALITY REPAIR PASS (fix ONLY the issues below on this draft and output ONLY the repaired "${fieldKey}" text):\n- ${fixes.join('\n- ')}\n\nDRAFT TO FIX:\n${cleaned}`;
            const retry = await runCascade({
              system: systemPrompt,
              user: repairPrompt,
              maxTokens: maxTok,
              temperature: Math.min(temperature, 0.65),
              providers,
            });
            const repaired = cleanFieldText(retry.content, fieldKey, charName);
            if (repaired.trim()) {
              cleaned = repaired;
              activeProvider = retry.provider;
            }
          } catch {
            // Non-fatal: keep the valid initial cleaned result if repair retry fails
          }
        }
        return { cleaned, provider: activeProvider };
      };
      if (useRefine) {
        const prompt = buildRefinementFieldPrompt(fieldKey, draft, notes, existingFields, isV3, policies)
          + (briefBlock ? `\n\n${briefBlock}` : '');
        const { content, provider } = await runCascade({
          system: CARD_FIELD_REFINE_SYSTEM, user: prompt, maxTokens: maxTok, temperature, providers,
        });
        const final = await finalizeField(content, prompt, CARD_FIELD_REFINE_SYSTEM, provider);
        return jsonResponse({ result: final.cleaned, fieldName: fieldKey, wholeCardBuilt: false, refined: true, provider: final.provider });
      }
      const prompt = buildSingleFieldUserPrompt(fieldKey, existingFields, isV3, policies)
        + (briefBlock ? `\n\n${briefBlock}` : '');
      const { content, provider } = await runCascade({
        system: CARD_FIELD_SYSTEM, user: prompt, maxTokens: maxTok, temperature, providers,
      });
      const final = await finalizeField(content, prompt, CARD_FIELD_SYSTEM, provider);
      return jsonResponse({ result: final.cleaned, fieldName: fieldKey, wholeCardBuilt: false, provider: final.provider });
    }
    /* --- GENERATE ALL (one-shot whole-card; prefer staged client orchestration) --- */
    if (action === 'generate-all') {
      const { existingFields, specVersion, refinementNotes, fieldPolicies } = body;
      const isV3 = specVersion === 'v3' || specVersion === 'V3';
      const notes = typeof refinementNotes === 'string' ? refinementNotes.trim() : '';
      const useRefine = notes.length > 0;
      const temperature = clampTemperature(body.temperature, 0.7);
      const policies = (fieldPolicies && typeof fieldPolicies === 'object' ? fieldPolicies : undefined) as FieldPolicyMap;
      let prompt = buildWholeCardUserPrompt(existingFields, isV3, policies);
      if (briefBlock) prompt += `\n\n${briefBlock}`;
      if (useRefine) prompt += buildRefineAllAppendix(notes);
      prompt += useRefine
        ? `\n\nGENERATE-ALL REFINE MODE: Return the complete revised card JSON. Client will apply every unlocked field.`
        : `\n\nGENERATE-ALL MODE: Return the complete card JSON. Client will apply every unlocked field.`;
      const { provider, card } = await callLLMForWholeCard(CARD_AUTHOR_SYSTEM, prompt, providers, CARD_JSON_MAX_TOKENS, temperature);
      const flatHubCard = sanitizeWholeCardFields(normalizeWholeCardToHub(card));
      return jsonResponse({ result: flatHubCard, provider, ...(useRefine ? { refined: true } : {}) });
    }
    /* --- CONVERT / IMPORT --- */
    if (action === 'convert-character') {
      const { inputText, outputFormat } = body;
      if (!inputText) return jsonResponse({ error: 'inputText is required' }, 400);
      const prompt = `You are given character data in an unknown format. Parse ALL the information and convert it into a ${outputFormat || 'V2/V3 compatible'} character card format.
INPUT DATA:
${inputText}
INSTRUCTIONS:
1. Identify all character information regardless of format (Character.AI, Pygmalion, W++, SBF, plain text, JSON, YAML, CCv2, CCv3, or any other format)
2. Map every piece of information to the most appropriate field
3. If info doesn't map directly, place it in the most logical field
4. ALL input text must be accounted for — nothing should be discarded
5. Return ONLY valid JSON
OUTPUT FORMAT:
{
  "name": "", "description": "", "personality": "", "scenario": "", "first_mes": "",
  "mes_example": "", "creator_notes": "", "system_prompt": "", "post_history_instructions": "",
  "tags": "", "creator": "", "nickname": "", "source": "", "group_only_greetings": ""
}
Return ONLY the JSON object, no explanation.`;
      const { content, provider } = await runCascade({
        system: 'You are a character card format conversion expert. You can parse any character format and convert to V2/V3 spec. You NEVER discard information. Respond with valid JSON only.',
        user: prompt, maxTokens: 4096, temperature: 0.3, jsonMode: true, providers,
      });
      const { card, parseError } = parseWholeCardJson(content);
      if (parseError || !card) return jsonResponse({ result: content, parseError: true, provider });
      return jsonResponse({ result: card, provider });
    }
    /* --- PROMPT BUILDER: single variable --- */
    if (action === 'generate-prompt-variable') {
      const { variableName, variableDescription, templateContext, existingVariables, rawContext } = body;
      if (!variableName) return jsonResponse({ error: 'variableName is required' }, 400);
      const cappedRaw = trimRawContext(rawContext);
      const contextParts: string[] = [];
      if (existingVariables) {
        for (const [key, value] of Object.entries(existingVariables)) {
          if (value && typeof value === 'string' && (value as string).trim()) contextParts.push(`${key}: ${value}`);
        }
      }
      const prompt = `Generate creative content for the template variable "${variableName}".
${variableDescription ? `Purpose: ${variableDescription}` : ''}
${templateContext ? `This variable is used in this template:\n${templateContext}` : ''}
${contextParts.length > 0 ? `Other filled variables:\n${contextParts.join('\n')}` : ''}
${cappedRaw ? `\nADDITIONAL RAW CONTEXT (use as source material — extract relevant details for this variable):\n${cappedRaw}` : ''}
Write ONLY the variable value — no labels, no quotes around it, no explanation. Be creative and stay consistent with any existing context.`;
      const { content, provider } = await runCascade({
        system: 'You are a creative writer specializing in AI roleplay prompts, scenarios, and character definitions. Generate concise, fitting content for prompt template variables.',
        user: prompt, maxTokens: PROMPT_VAR_MAX_TOKENS, temperature: 0.8, providers,
      });
      return jsonResponse({ result: content.trim(), provider });
    }
    /* --- PROMPT BUILDER: all variables --- */
    if (action === 'generate-all-prompt-variables') {
      const { templateName, templateDescription, template, variables, existingVariables, rawContext } = body;
      if (!variables || !Array.isArray(variables)) return jsonResponse({ error: 'variables array is required' }, 400);
      const cappedRaw = trimRawContext(rawContext);
      const contextParts: string[] = [];
      if (existingVariables) {
        for (const [key, value] of Object.entries(existingVariables)) {
          if (value && typeof value === 'string' && (value as string).trim()) contextParts.push(`${key}: ${value}`);
        }
      }
      type PromptVariable = { name: string; description: string; placeholder: string };
      const promptVariables = variables.filter((v: unknown): v is PromptVariable => {
        if (!v || typeof v !== 'object') return false;
        const c = v as Record<string, unknown>;
        return typeof c.name === 'string' && typeof c.description === 'string' && typeof c.placeholder === 'string';
      });
      const varList = promptVariables.map((v) => `- ${v.name}: ${v.description} (example: ${v.placeholder})`).join('\n');
      const prompt = `Generate ALL variables for the "${templateName}" prompt template.
Template description: ${templateDescription}
Template:
${template}
Variables to generate:
${varList}
${contextParts.length > 0 ? `EXISTING CONTENT (use as foundation — expand, enhance, stay consistent):\n${contextParts.join('\n')}` : 'No variables filled yet — create original, compelling content.'}
${cappedRaw ? `\nRAW CONTEXT (use as primary source material):\n${cappedRaw}` : ''}
RESPOND IN VALID JSON FORMAT ONLY. Each variable name as a key, generated content as the value.
Generate ALL variables listed above. Every variable must have a value.`;
      const { content, provider } = await runCascade({
        system: 'You are a creative writer specializing in AI roleplay prompts, scenarios, lorebook entries, and character definitions. ALWAYS respond with valid JSON only — no markdown, no explanation.',
        user: prompt, maxTokens: PROMPT_ALL_VARS_MAX_TOKENS, temperature: 0.8, jsonMode: true, providers,
      });
      const { card, parseError } = parseWholeCardJson(content);
      if (parseError || !card) return jsonResponse({ result: content, parseError: true, provider });
      return jsonResponse({ result: card as Record<string, string>, provider });
    }
    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const upstream = /LLM API error|timeout|All LLM providers failed|No usable provider keys|truncated|incomplete/i.test(message);
    return jsonResponse({ error: message }, upstream ? 502 : 500);
  }
});
