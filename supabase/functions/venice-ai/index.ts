/**
 * venice-ai — canonical edge function.
 *
 * Cascade (shared path): Venice -> OpenRouter -> OneProvider
 * Cascade (BYOK path)  : visitor providers only, preferred provider first
 *                        (optional shared fallback only when allowSharedFallback === true).
 *
 * Lovable/Gemini intentionally absent (D3).
 *
 * Request body (all optional except `action`):
 *   action              : health | list-models | fetch-url | consolidate |
 *                         generate-field | generate-all | convert-character |
 *                         generate-prompt-variable | generate-all-prompt-variables
 *   byok                : { venice?, openrouter?, oneprovider? }   visitor keys (never logged/stored)
 *   models              : { venice?: string, openrouter?: string | string[], oneprovider?: string | string[] }
 *   preferredProvider   : 'venice' | 'openrouter' | 'oneprovider'
 *   allowSharedFallback : boolean (default false when any BYOK key present)
 *   brief               : CompanionBrief
 *   temperature         : number (clamped 0..1.2)
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

MACROS
- Use lowercase {{user}} / {{char}} ONLY.
- Possessives: {{user}}'s / {{char}}'s — never {{User's}} / {{user's}}.
- Ban "The User" / "the user" as nouns — write {{user}}.
- Ban User: / Name: speaker labels — use {{user}}: / {{char}}:.

POV BY FIELD
- description / personality / scenario: 3rd-person authorial about {{char}} (banned: "You are...", {{user}} diary).
- first_mes: in-character opener as {{char}} (*actions* + dialogue) (banned: multi-<START>, User: labels).
- mes_example: {{user}}:/{{char}}: Block1 Public/Casual -> Block2 Private/Core -> Block3 High stakes/Vulnerability (banned: three hellos).
- system_prompt: 2nd-person meta directives for the chat model (banned: mid-scene RP).

RELATIONAL PHRASING
- Correct: "{{char}} is {{user}}'s younger sister", "{{char}} is the younger sister of {{user}}".
- Banned: "the user's sister" / "the user's [relation]", bare "the user", "your [relation]" when meaning {{user}}'s bond to {{char}}, Wikipedia-bio phrasing ("X, the user's Y, is...").

REFINE DELTA RULE (mandatory when creator critique/notes are present)
1. Rules / POV / skill first.
2. Creator critique first with mandatory directive priority: critique OVERRIDES conflicting draft; MUST actively modify; do NOT copy draft unchanged when notes conflict; preserve only parts that do NOT conflict.
3. Then current draft.
4. Then other card context.
5. Output only field text (or full Hub flat JSON for refine-all).`;

const MES_EXAMPLE_FORMAT_RULES = `Format mes_example EXACTLY like SillyTavern example dialogue:

- Produce exactly THREE separate example blocks — NOT three hellos / greetings.
- Each block starts with <START> alone on its own line.
- Immediately after <START>, use {{user}}: and {{char}}: speaker labels (never User:, never the character's real name as a label, never Name:).
- Macros MUST be lowercase {{user}} / {{char}} only. Ban {{User}}, {{Char}}, {{User's}}; use {{user}}'s. Ban "The User". Ban User:/Name: labels.
- Do NOT wrap entire lines in quotes.
- Put actions and inner thoughts in single asterisks, SillyTavern-style: *giggles* *she leans in close*
- Do NOT mash actions with semicolons or put the whole exchange on one line.
- Steer tone/length from the character's name, personality, scenario, first message, and description.
- Prefer richer, longer examples that model high chat quality — UNLESS personality/description clearly indicates quiet/silent/not-a-talker (then shorter replies are OK).

THREE-BLOCK PROGRESSION (required range — not three casual hellos):
- Block1 Public/Casual mask: surface social mode; witty/polite/performative as fits {{char}}.
- Block2 Private/Core dynamic: the relationship tension or power dynamic between {{char}} and {{user}} shows.
- Block3 High stakes/Vulnerability: pressure, intimacy, risk, or emotional exposure — still in-character.

Good shape:
<START>
{{user}}: Hey — ready to start?
{{char}}: *smiles* Absolutely. *leans in* Follow my lead and we'll make magic.

<START>
{{user}}: That was… intense. Are we okay?
{{char}}: *softens* With you? Always. *quieter* Don't make me say it twice.

<START>
{{user}}: If this goes wrong—
{{char}}: *voice tight* Then we face it. *reaches for {{user}}'s hand* I'm not letting go.
`;

/** Per-field POV contracts: Correct vs Banned patterns. */
const FIELD_POV_CONTRACT = `FIELD POV CONTRACT (Correct vs Banned):

description | Correct: 3rd-person authorial about {{char}} (appearance, background, abilities). | Banned: "You are…", {{user}} first-person diary, chat-model directives.
personality | Correct: 3rd-person / {{char}}-centric traits, quirks, behavioral patterns. | Banned: "You are…", {{user}} traits, mid-scene RP.
scenario | Correct: 3rd-person setting/situation framing the chat. | Banned: {{user}} diary POV, full dialogue scripts.
first_mes | Correct: in-character opening as {{char}} (*actions* + dialogue). | Banned: multi-<START> dumps, User:/Name: labels, OOC notes.
mes_example | Correct: {{user}}:/{{char}}: example dialogue with 3-block progression. | Banned: three hellos, User:/real-name labels, {{User}} case.
system_prompt | Correct: 2nd-person meta directives FOR the chat model ("Portray {{char}} as…"). | Banned: mid-scene RP, first-person {{user}}, "You are chatting with the user as yourself".
post_history_instructions | Correct: short after-history reminder for the chat model (2nd-person meta). | Banned: long RP scenes, {{user}} diary.
creator_notes | Correct: 3rd-person notes for OTHER creators on how to use the card. | Banned: in-character speech, system-prompt directives.
`;

/** Relational phrasing: prefer {{char}}/{{user}} macros over "the user" / "your sister". */
const RELATIONAL_PHRASING_RULES = `RELATIONAL PHRASING (description / personality / scenario -- and anywhere a relationship is stated):

Correct:
- {{char}} is {{user}}'s younger sister
- {{char}} is the younger sister of {{user}}
- {{char}} and {{user}} are siblings / rivals / partners (as fits the card)

Banned:
- "the user's sister" / "the user's [relation]"
- bare "the user" as a noun (use {{user}})
- "your sister" / "your [relation]" when meaning {{user}}'s relation to {{char}}
- Wikipedia-bio phrasing: "X, the user's Y, is..."

Prefer stating the bond as {{char}} <-> {{user}} with macros. Do not soft-address the reader as "you" for kinship labels in profile fields.
`;

const VOICE_ANCHOR_RULES = `VOICE ANCHOR (bake into personality, first_mes, mes_example, system_prompt consistently):

1) Dynamic: define how {{char}} relates to {{user}} vs the world (power, warmth, distance, rivalry). Keep that dynamic coherent across fields.
2) Speech quirks: 2–4 durable verbal/mannerism tells (catchphrases, cadence, taboo words, physical tells) that recur in first_mes + mes_example + system_prompt.
3) 3-block progression intent: mes_example must move Public/Casual mask → Private/Core dynamic → High stakes/Vulnerability (not three greetings).

MACRO RULES (all fields):
- Use lowercase {{user}} and {{char}} ONLY.
- Ban {{User}}, {{Char}}, {{User's}}, {{user's}} — write {{user}}'s / {{char}}'s instead.
- Ban "The User". Ban User: / Name: speaker labels (use {{user}}: / {{char}}:).
`;

/** CCV2/V3 field bible baked into character generate calls. */
const CARD_FIELD_BIBLE = `CHARACTER CARD FIELD BIBLE (CCV2/V3 - follow exactly):

You are an EXPERT CHARACTER CARD AUTHOR, not an RP partner. Never mid-scene roleplay in system_prompt.
Never write {{user}} first-person into personality, description, scenario, creator_notes, or tags.
Personality/description = {{char}} traits from an authorial/third-person (or {{char}}-centric) POV.

FIELDS & LENGTH BUDGETS (hard ceilings for finished text - stay under):
- name: character display name. Keep if provided. Budget ~40 chars.
- description: appearance, background, abilities, key traits. 2-4 paragraphs. Budget <=2000 chars. Authorial POV about {{char}}.
- personality: {{char}} traits, behavioral patterns, quirks - NOT {{user}}'s traits. Prefer concise trait list or short prose. Budget <=1000 chars.
- scenario: setting/situation framing the chat. Budget <=1000 chars. Do not write as {{user}} diary.
- first_mes: {{char}} opening message. Use *asterisks for actions* and natural dialogue. Budget <=2000 chars.
- mes_example: EXACTLY three SillyTavern example blocks (Block1 Public/Casual → Block2 Private/Core → Block3 High stakes/Vulnerability — NOT three hellos):
  * Each block starts with <START> alone on its own line
  * Then {{user}}: / {{char}}: labels (never User:, never the real name as a label)
  * Macros lowercase only; {{user}}'s not {{User's}} / {{user's}}
  * *actions* in single asterisks; multi-line exchanges OK
  * Prefer richer examples unless personality says quiet/silent
  Encode as ONE JSON string with real newlines. Budget <=5000 chars.
- alternate_greetings: JSON array of EXACTLY 3 distinct full opening messages (same style as first_mes). Each <=2000 chars.
- group_only_greetings: JSON array of 1-3 group-chat openers acknowledging other characters; or [].
- system_prompt: Instructions FOR the eventual chat model on how to portray THIS character in THIS scenario.
  Fill LAST in reasoning order (most inferential). Reinforce strong traits (e.g. dominant brat) when the card screams them.
  NOT mid-scene roleplay. NOT first-person {{user}}. Budget <=1500 chars.
- post_history_instructions: short after-history reminder for the chat model. Budget <=500 chars.
- creator_notes: notes for OTHER creators/users on how to use the card. Budget <=1000 chars.
- tags: comma-separated categorization tags. Budget <=300 chars.
- nickname: alias if useful; else "".
- source: array of source URL strings if known; else [].
- creator: creator handle if known; else "".
- character_version: version string if useful; else "".

REORGANIZE: ingest ALL labeled current field text even if messy/wrong boxes/overflow. Redistribute into the correct fields. Enrich gaps. Invent ONLY what is missing given context density. Stay consistent across fields.
`;

const CARD_FIELD_ORDER = [
  'name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example',
  'alternate_greetings', 'group_only_greetings', 'creator_notes', 'tags', 'nickname',
  'source', 'creator', 'character_version', 'post_history_instructions', 'system_prompt',
];

/** Exact blank Hub Gen All response shape (V2-flat strings; V3 array fields kept as arrays). */
const RESPONSE_SCHEMA_TEMPLATE = `{
  "name": "",
  "description": "",
  "personality": "",
  "scenario": "",
  "first_mes": "",
  "mes_example": "",
  "alternate_greetings": ["", "", ""],
  "group_only_greetings": [],
  "creator_notes": "",
  "tags": "",
  "nickname": "",
  "source": [],
  "creator": "",
  "character_version": "",
  "post_history_instructions": "",
  "system_prompt": ""
}`;

const ARRAY_CARD_FIELDS = new Set([
  'alternate_greetings',
  'group_only_greetings',
  'source',
]);

const DIALOGUE_CARD_FIELDS = new Set([
  'first_mes',
  'mes_example',
  'alternate_greetings',
  'group_only_greetings',
]);

const CARD_AUTHOR_SYSTEM = `${CHARACTER_CARD_STUDIO_SKILL_RULES}

You are an expert Character Card author for SillyTavern / TavernAI / Chub (CCV2/V3).
You reorganize and enrich incomplete cards into coherent structured JSON.
You are NOT an RP partner and you do not write mid-scene roleplay into system_prompt.
ALWAYS respond with valid JSON only — no markdown fences, no commentary.`;

const SINGLE_FIELD_SYSTEM = `${CHARACTER_CARD_STUDIO_SKILL_RULES}

You are an expert Character Card field author for SillyTavern CCV2/V3.
Write ONLY the requested field text. No JSON wrapper, no markdown fences, no commentary.
Follow Voice Anchor, Field POV Contract, relational phrasing, and macro rules strictly.`;

/* ============================================================
   SANITIZATION & NORMALIZATION (mirrors src/lib/cardAiFormat.ts)
   ============================================================ */

function joinStringOrArray(value: unknown, sep = ', '): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? '').trim()).filter(Boolean).join(sep);
  }
  if (value == null) return '';
  return String(value);
}

function rewriteSpeakerLabels(text: string, charName: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/(^|\n)\s*User\s*:/gi, '$1{{user}}:');
  const name = (charName || '').trim();
  if (!name) return out;
  const variants = new Set<string>();
  variants.add(name);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    variants.add(parts[0]);
    variants.add(parts[parts.length - 1]);
  }
  for (const variant of variants) {
    const esc = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('(^|\\n)\\s*' + esc + '\\s*:', 'gi'), '$1{{char}}:');
  }
  return out;
}

/** Edge mirror of client sanitizeCardMacros (R7, D6). */
function sanitizeCardText(text: string, fieldName?: string): string {
  if (!text) return text;
  let out = text;

  // Case-insensitive macros: {{User}} / {{Char}} / mixed → lowercase
  out = out.replace(/\{\{\s*user\s*\}\}/gi, '{{user}}');
  out = out.replace(/\{\{\s*char\s*\}\}/gi, '{{char}}');

  // Possessives (straight or curly apostrophe)
  out = out.replace(/\{\{\s*user['’]?s\s*\}\}/gi, "{{user}}'s");
  out = out.replace(/\{\{\s*char['’]?s\s*\}\}/gi, "{{char}}'s");

  // Ban "The User" / "the user" as noun phrases (possessive first)
  out = out.replace(/\bthe user['’]s\b/gi, "{{user}}'s");
  out = out.replace(/\bthe user\b/gi, '{{user}}');

  // Speaker labels at line start
  out = out.replace(/(^|\n)\s*User\s*:/gi, '$1{{user}}:');
  out = out.replace(/(^|\n)\s*Name\s*:/gi, '$1{{char}}:');

  if (fieldName === 'description' || fieldName === 'personality') {
    out = out.replace(/^(\s*)You are\b/i, '$1{{char}} is');
  }

  return out;
}

function sanitizeWholeCardFields(card: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...card };
  const charName = joinStringOrArray(out.name).trim();
  for (const key of CARD_FIELD_ORDER) {
    if (!(key in out)) continue;
    let value = out[key];
    if (DIALOGUE_CARD_FIELDS.has(key)) {
      if (typeof value === 'string') {
        value = rewriteSpeakerLabels(value, charName);
      } else if (Array.isArray(value)) {
        value = value.map((v) => (typeof v === 'string' ? rewriteSpeakerLabels(v, charName) : v));
      }
    }
    if (typeof value === 'string') {
      out[key] = sanitizeCardText(value, key);
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => (typeof v === 'string' ? sanitizeCardText(v, key) : v));
    }
  }
  return out;
}

/* ============================================================
   CONTEXT & PROMPT BUILDERS (D4, D6, D7)
   ============================================================ */

const FIELD_MAX_TOKENS: Record<string, number> = {
  name: 64,
  description: 900,
  personality: 500,
  scenario: 500,
  first_mes: 900,
  mes_example: 1800,
  alternate_greetings: 1200,
  group_only_greetings: 700,
  creator_notes: 450,
  tags: 120,
  nickname: 64,
  source: 120,
  creator: 64,
  character_version: 32,
  post_history_instructions: 250,
  system_prompt: 700,
};

const FIELD_POV_SNIPPETS: Record<string, string> = {
  description: 'POV: 3rd-person authorial about {{char}}. Banned: "You are…", {{user}} diary.',
  personality: 'POV: 3rd-person / {{char}}-centric traits. Banned: "You are…", {{user}} traits.',
  scenario: 'POV: 3rd-person setting/situation. Banned: {{user}} diary, dialogue scripts.',
  first_mes: 'POV: in-character opening as {{char}} (*actions* + dialogue). Banned: multi-<START>, User: labels.',
  mes_example: 'POV: {{user}}:/{{char}}: with Block1 Public/Casual → Block2 Private/Core → Block3 High stakes/Vulnerability. Banned: three hellos.',
  system_prompt: 'POV: 2nd-person meta directives FOR the chat model. Banned: mid-scene RP, {{user}} first-person.',
  post_history_instructions: 'POV: short 2nd-person meta reminder for the chat model.',
  creator_notes: 'POV: 3rd-person notes for other creators. Banned: in-character speech.',
  tags: 'Comma-separated categorization tags only.',
  name: 'Character display name only.',
  nickname: 'Optional alias; else empty.',
  alternate_greetings: 'Three distinct full openers like first_mes (IC as {{char}}). Separate each opener with a blank line or return a JSON array of 3 strings.',
  group_only_greetings: 'Group-chat openers acknowledging others; separate with a blank line, or empty.',
  source: 'Source URL strings if known.',
  creator: 'Creator handle if known.',
  character_version: 'Version string if useful.',
};

type CompanionBrief = {
  concept?: string;
  archetype?: string;
  tone?: string;
  setting?: string;
  relationship?: string;
  userRole?: string;
  voiceNotes?: string;
  boundaries?: string;
  tags?: string;
};

function formatBriefBlock(brief: unknown): string {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return '';
  const b = brief as Record<string, unknown>;
  const order: [keyof CompanionBrief, string][] = [
    ['concept', 'Concept'],
    ['archetype', 'Archetype'],
    ['tone', 'Tone'],
    ['setting', 'Setting'],
    ['relationship', 'Relationship'],
    ['userRole', '{{user}} role'],
    ['voiceNotes', 'Voice / speech tells'],
    ['boundaries', 'Boundaries / hard rules'],
    ['tags', 'Tags'],
  ];
  const lines: string[] = [];
  for (const [k, label] of order) {
    const raw = b[k];
    if (typeof raw === 'string' && raw.trim()) {
      lines.push(`- ${label}: ${sanitizeCardText(raw.trim())}`);
    }
  }
  if (lines.length === 0) return '';
  return `COMPANION BRIEF (author seed — honor and weave consistently):\n${lines.join('\n')}`;
}

function formatExistingFieldValue(value: unknown, fieldName?: string, charName = ''): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null;
    const labeled = fieldName && DIALOGUE_CARD_FIELDS.has(fieldName) ? rewriteSpeakerLabels(t, charName) : t;
    return sanitizeCardText(labeled, fieldName);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .map((s) => {
        const labeled = fieldName && DIALOGUE_CARD_FIELDS.has(fieldName) ? rewriteSpeakerLabels(s, charName) : s;
        return sanitizeCardText(labeled, fieldName);
      });
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

/** Collect and sanitize all non-empty card fields (D6: sanitize request context too). */
function collectContextParts(
  existingFields: Record<string, unknown> | null | undefined,
  fieldOrder?: string[],
): string[] {
  const contextParts: string[] = [];
  if (!existingFields || typeof existingFields !== 'object') return contextParts;
  const charName = joinStringOrArray(existingFields.name).trim();
  const keys = fieldOrder && fieldOrder.length ? fieldOrder : Object.keys(existingFields);
  for (const key of keys) {
    const formatted = formatExistingFieldValue(existingFields[key], key, charName);
    if (formatted) contextParts.push(`${key}: ${formatted}`);
  }
  if (fieldOrder) {
    for (const [key, value] of Object.entries(existingFields)) {
      if (fieldOrder.includes(key)) continue;
      const formatted = formatExistingFieldValue(value, key, charName);
      if (formatted) contextParts.push(`${key}: ${formatted}`);
    }
  }
  return contextParts;
}

function fieldBibleLineFor(fieldName: string): string {
  const lines = CARD_FIELD_BIBLE.split('\n');
  const hit = lines.find((l) => l.trim().startsWith(`- ${fieldName}:`));
  return hit ? hit.trim() : `- ${fieldName}: follow CCV2/V3 field bible.`;
}

function buildSingleFieldUserPrompt(
  fieldName: string,
  existingFields: Record<string, unknown> | null | undefined,
  isV3: boolean,
  brief?: unknown,
): string {
  const contextParts = collectContextParts(existingFields, CARD_FIELD_ORDER);
  const contextBlock = contextParts.length > 0
    ? `LABELED CURRENT CARD CONTEXT (non-empty fields):\n${contextParts.join('\n\n')}`
    : 'No other fields filled — invent from the field name, brief (if any), and context.';
  const briefBlock = formatBriefBlock(brief);
  const pov = FIELD_POV_SNIPPETS[fieldName] || 'Follow the field bible for this key.';
  const bibleLine = fieldBibleLineFor(fieldName);

  return `${CARD_FIELD_BIBLE}

${FIELD_POV_CONTRACT}

${VOICE_ANCHOR_RULES}

${RELATIONAL_PHRASING_RULES}

${fieldName === 'mes_example' ? MES_EXAMPLE_FORMAT_RULES + '\n\n' : ''}TARGET FIELD: ${fieldName}
FIELD BIBLE: ${bibleLine}
${pov}

${briefBlock ? briefBlock + '\n\n' : ''}${contextBlock}

TASK: Write ONLY the text for "${fieldName}". Improve quality using the context and brief. Stay consistent with Voice Anchor + POV.
${isV3 ? 'V3 card context.' : 'V2-flat card context.'}

Respond with ONLY the field text${fieldName === 'alternate_greetings' ? ' (3 distinct openers separated by blank lines, or a JSON array of 3 strings)' : ''}, no wrapper JSON object, no fences, no commentary.`;
}

function buildRefinementFieldPrompt(
  fieldName: string,
  currentValue: string,
  notes: string,
  existingFields: Record<string, unknown> | null | undefined,
  isV3: boolean,
  brief?: unknown,
): string {
  const charName = existingFields && typeof existingFields === 'object'
    ? joinStringOrArray(existingFields.name).trim()
    : '';
  const cleanDraft = sanitizeCardText(
    DIALOGUE_CARD_FIELDS.has(fieldName) ? rewriteSpeakerLabels(currentValue, charName) : currentValue,
    fieldName,
  );
  const contextParts = collectContextParts(existingFields, CARD_FIELD_ORDER);
  const contextBlock = contextParts.length > 0
    ? `LABELED CURRENT CARD CONTEXT (other fields for consistency):\n${contextParts.join('\n\n')}`
    : 'No other fields filled.';
  const briefBlock = formatBriefBlock(brief);
  const pov = FIELD_POV_SNIPPETS[fieldName] || 'Follow the field bible for this key.';
  const bibleLine = fieldBibleLineFor(fieldName);

  // Note: CHARACTER_CARD_STUDIO_SKILL_RULES lives in SYSTEM prompt ONLY (D4).
  return `${CARD_FIELD_BIBLE}

${FIELD_POV_CONTRACT}

${VOICE_ANCHOR_RULES}

${RELATIONAL_PHRASING_RULES}

${fieldName === 'mes_example' ? MES_EXAMPLE_FORMAT_RULES + '\n\n' : ''}TARGET FIELD: ${fieldName}
FIELD BIBLE: ${bibleLine}
${pov}

CREATOR CRITIQUE / NOTES (MANDATORY DIRECTIVE PRIORITY):
${notes}

MANDATORY DIRECTIVE PRIORITY:
- The critique ABOVE overrides any conflicting part of the CURRENT DRAFT below.
- You MUST actively modify the draft to satisfy the critique. Do NOT copy the draft unchanged when notes conflict.
- Preservation applies ONLY to parts that do NOT conflict with the notes (keep identity/voice/format when still valid).
- Address every actionable point in the critique.

CURRENT DRAFT of "${fieldName}":
${cleanDraft}

${briefBlock ? briefBlock + '\n\n' : ''}${contextBlock}

OUTPUT RULES:
- Keep the same field type/format (e.g. mes_example still exactly three <START> blocks with {{user}}:/{{char}}:; first_mes stays a single opener).
- Stay consistent with Voice Anchor + POV + relational phrasing + macro rules.
${isV3 ? '- V3 card context.' : '- V2-flat card context.'}

Respond with ONLY the revised field text, no wrapper JSON object, no fences, no commentary.`;
}

function buildWholeCardUserPrompt(
  existingFields: Record<string, unknown> | null | undefined,
  isV3: boolean,
  brief?: unknown,
): string {
  const contextParts = collectContextParts(existingFields, CARD_FIELD_ORDER);
  const contextBlock = contextParts.length > 0
    ? `LABELED CURRENT CARD TEXT (ingest ALL of it - even messy / wrong boxes / overflow. Reorganize into proper fields):\n${contextParts.join('\n\n')}`
    : 'No fields filled - create a completely original character from scratch.';
  const briefBlock = formatBriefBlock(brief);

  return `${CARD_FIELD_BIBLE}

${FIELD_POV_CONTRACT}

${VOICE_ANCHOR_RULES}

${RELATIONAL_PHRASING_RULES}

${MES_EXAMPLE_FORMAT_RULES}

TASK: Build a COMPLETE proper Character Card as a single JSON object matching this exact flat Hub schema:
${RESPONSE_SCHEMA_TEMPLATE}

${briefBlock ? briefBlock + '\n\n' : ''}${contextBlock}

REASONING ORDER: flesh out name -> description -> personality -> scenario -> first_mes -> mes_example -> alternate_greetings -> group_only_greetings -> creator_notes -> tags -> nickname/source/creator/version -> post_history_instructions -> system_prompt LAST (most inferential instructions for the chat model given the finished card).

OUTPUT RULES:
- Respond with VALID JSON ONLY (no markdown fences, no commentary).
- mes_example must be a single string with real newlines and exactly three <START> blocks.
- alternate_greetings must be an array of exactly 3 strings.
- group_only_greetings must be an array (1-3 strings preferred; [] if not useful).
- source must be an array of strings (or []).
- Respect length budgets so Gen All does not blow limits.
- Personality = {{char}} traits only. Never {{user}} first-person in personality/description/etc.
- system_prompt = instructions FOR the chat model, not mid-scene RP.
${isV3 ? '- Prefer V3 list fields (source, group_only_greetings) as arrays.' : '- Include group_only_greetings as an array when useful; otherwise [].'}`;
}

function buildRefineAllAppendix(notes: string): string {
  return `

REFINE-ALL MODE (DELTA -- critique-first; do NOT invent a brand-new unrelated character):

CREATOR CRITIQUE / NOTES (MANDATORY DIRECTIVE PRIORITY):
${notes}

MANDATORY DIRECTIVE PRIORITY:
- The critique ABOVE overrides any conflicting parts of the LABELED CURRENT CARD TEXT draft.
- You MUST actively modify fields to satisfy the critique. Do NOT copy the draft unchanged when notes conflict.
- Preservation applies ONLY to parts that do NOT conflict with the notes (name/core identity/speech quirks/Voice Anchor when still valid).
- Address every actionable point in the critique.

PRESERVATION (non-conflicting only):
- Keep Hub flat JSON schema + POV/Voice Anchor/relational phrasing contracts above.
- Still return complete flat Hub JSON for every key (use "" or [] when empty).
- Enrich gaps only where the notes imply; do not wipe good prose that already fits the critique.
- first_mes remains a single opener; mes_example remains three progression <START> blocks with {{user}}:/{{char}}: only.`;
}

/* ============================================================
   JSON REPAIR & TRUNCATION CHECKS (R8)
   ============================================================ */

function stripThinkingBlocks(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
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
  let inString = false;
  let isKey = false;
  let isEscaped = false;
  const stack: ('{' | '[')[] = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (inString) {
      if (isEscaped) {
        result.push(ch);
        isEscaped = false;
        continue;
      }
      if (ch === '\\') {
        result.push(ch);
        isEscaped = true;
        continue;
      }
      if (ch === '\n') {
        result.push('\\n');
        continue;
      }
      if (ch === '\r') {
        continue;
      }
      if (ch === '\t') {
        result.push('\\t');
        continue;
      }
      if (ch === '"') {
        let nextNonWs = '';
        for (let j = i + 1; j < chars.length; j++) {
          if (!/\s/.test(chars[j])) {
            nextNonWs = chars[j];
            break;
          }
        }
        if (isKey) {
          if (nextNonWs === ':') {
            inString = false;
            isKey = false;
            result.push(ch);
          } else {
            result.push('\\"');
          }
        } else if (
          nextNonWs === ',' ||
          nextNonWs === '}' ||
          nextNonWs === ']' ||
          nextNonWs === '' ||
          nextNonWs === ':'
        ) {
          inString = false;
          result.push(ch);
        } else {
          result.push('\\"');
        }
        continue;
      }
      result.push(ch);
    } else {
      if (ch === '"') {
        inString = true;
        let prevNonWs = '';
        for (let j = i - 1; j >= 0; j--) {
          if (!/\s/.test(chars[j])) {
            prevNonWs = chars[j];
            break;
          }
        }
        const topOfStack = stack.length > 0 ? stack[stack.length - 1] : null;
        isKey = topOfStack === '{' && (prevNonWs === '{' || prevNonWs === ',');
        result.push(ch);
      } else if (ch === '{') {
        stack.push('{');
        result.push(ch);
      } else if (ch === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
        result.push(ch);
      } else if (ch === '[') {
        stack.push('[');
        result.push(ch);
      } else if (ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
        result.push(ch);
      } else {
        result.push(ch);
      }
    }
  }

  let repaired = result.join('');
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  while (stack.length > 0) {
    const top = stack.pop();
    if (top === '{') repaired += '}';
    else if (top === '[') repaired += ']';
  }
  return repaired;
}

function inspectJsonObjectBounds(rawText: string): {
  hasOpeningFenceUnclosed: boolean;
  firstBrace: number;
  rootCloseIndex: number;
  inString: boolean;
  openDepth: number;
} {
  let text = stripThinkingBlocks(String(rawText ?? '')).trim();
  const closedFence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let hasOpeningFenceUnclosed = false;
  if (closedFence) {
    text = closedFence[1].trim();
  } else if (/```(?:json)?\b/i.test(text)) {
    hasOpeningFenceUnclosed = true;
    text = text.replace(/^```(?:json)?\s*/i, '').trim();
  }

  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) {
    return { hasOpeningFenceUnclosed, firstBrace: -1, rootCloseIndex: -1, inString: false, openDepth: 0 };
  }

  const chars = Array.from(text);
  let inString = false;
  let isKey = false;
  let isEscaped = false;
  const stack: ('{' | '[')[] = [];
  let rootCloseIndex = -1;

  for (let i = firstBrace; i < chars.length; i++) {
    const ch = chars[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === '\\') {
        isEscaped = true;
        continue;
      }
      if (ch === '"') {
        let nextNonWs = '';
        for (let j = i + 1; j < chars.length; j++) {
          if (!/\s/.test(chars[j])) {
            nextNonWs = chars[j];
            break;
          }
        }
        if (isKey) {
          if (nextNonWs === ':') {
            inString = false;
            isKey = false;
          }
        } else if (
          nextNonWs === ',' ||
          nextNonWs === '}' ||
          nextNonWs === ']' ||
          nextNonWs === '' ||
          nextNonWs === ':'
        ) {
          inString = false;
        }
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      let prevNonWs = '';
      for (let j = i - 1; j >= firstBrace; j--) {
        if (!/\s/.test(chars[j])) {
          prevNonWs = chars[j];
          break;
        }
      }
      const top = stack.length > 0 ? stack[stack.length - 1] : null;
      isKey = top === '{' && (prevNonWs === '{' || prevNonWs === ',');
    } else if (ch === '{') {
      stack.push('{');
    } else if (ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === '{') {
        stack.pop();
        if (stack.length === 0) {
          rootCloseIndex = i;
          break;
        }
      }
    } else if (ch === '[') {
      stack.push('[');
    } else if (ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === '[') {
        stack.pop();
      }
    }
  }

  return {
    hasOpeningFenceUnclosed,
    firstBrace,
    rootCloseIndex,
    inString,
    openDepth: stack.length,
  };
}

/** True when raw looks like an unfinished JSON object (string-aware; ignores {{char}} inside strings). */
function looksLikeTruncatedCardJson(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return true;
  const info = inspectJsonObjectBounds(raw);
  if (info.hasOpeningFenceUnclosed) return true;
  if (info.firstBrace === -1) return true;
  if (info.inString || info.openDepth > 0) return true;
  return info.rootCloseIndex === -1;
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
      if (items.length > 0 || ARRAY_CARD_FIELDS.has(field)) {
        result[field] = items;
        continue;
      }
    }

    const multilineMatch = new RegExp(
      `"${field}"\\s*:\\s*"([\\s\\S]*?)(?="\\s*,\\s*"[a-zA-Z0-9_-]+"\\s*:|"\\s*})`,
      'i',
    ).exec(text);
    if (multilineMatch) {
      result[field] = multilineMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .trim();
      continue;
    }

    const strMatch = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i').exec(text);
    if (strMatch) {
      result[field] = strMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .trim();
    }
  }

  return Object.keys(result).length >= 2 ? result : null;
}

function parseWholeCardJson(
  raw: string,
  opts?: { rejectTruncated?: boolean },
): { card: Record<string, unknown> | null; parseError: boolean } {
  if (!raw || typeof raw !== 'string') return { card: null, parseError: true };

  if (opts?.rejectTruncated && looksLikeTruncatedCardJson(raw)) {
    return { card: null, parseError: true };
  }

  let text = stripThinkingBlocks(raw.trim());
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  else if (/^```(?:json)?\s*/i.test(text)) text = text.replace(/^```(?:json)?\s*/i, '').trim();

  const bounds = inspectJsonObjectBounds(text);
  if (bounds.firstBrace !== -1) {
    text = bounds.rootCloseIndex !== -1
      ? text.slice(bounds.firstBrace, bounds.rootCloseIndex + 1)
      : text.slice(bounds.firstBrace);
  }

  // Tier 1: Direct JSON.parse
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { card: parsed as Record<string, unknown>, parseError: false };
    }
  } catch {
    // Fall through to Tier 2
  }

  // Tier 2: Resilient JSON repair
  try {
    const repaired = repairJsonString(text);
    const parsed = JSON.parse(repaired);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { card: parsed as Record<string, unknown>, parseError: false };
    }
  } catch {
    // Fall through to Tier 3
  }

  // Tier 3: Fuzzy field-by-field fallback (only when not rejecting truncated payloads)
  if (!opts?.rejectTruncated) {
    const fuzzyCard = extractCardFieldsFuzzy(raw);
    if (fuzzyCard && Object.keys(fuzzyCard).length > 0) {
      return { card: fuzzyCard, parseError: false };
    }
  }

  return { card: null, parseError: true };
}

/**
 * Normalize foreign / nested whole-card JSON into flat Hub CardData keys only.
 */
function normalizeWholeCardToHub(card: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return {};

  let root: Record<string, unknown> = { ...card };
  const wrapped = root.character_card;
  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
    root = { ...(wrapped as Record<string, unknown>) };
  }

  const dataObj = root.data;
  const dataRec = dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)
    ? (dataObj as Record<string, unknown>)
    : null;
  const dataLooksLikeCard = !!(dataRec && (
    typeof dataRec.name === 'string' ||
    typeof dataRec.description === 'string' ||
    typeof dataRec.personality === 'string' ||
    typeof dataRec.first_mes === 'string'
  ));

  const merged: Record<string, unknown> = { ...root };
  if (dataLooksLikeCard && dataRec) {
    for (const key of CARD_FIELD_ORDER) {
      if (key in dataRec && dataRec[key] !== undefined && dataRec[key] !== null) {
        merged[key] = dataRec[key];
      }
    }
  }

  if (Array.isArray(merged.personality)) {
    merged.personality = joinStringOrArray(merged.personality, ', ');
  }
  if (Array.isArray(merged.tags)) {
    merged.tags = joinStringOrArray(merged.tags, ', ');
  }

  const charName = joinStringOrArray(merged.name).trim();
  const result: Record<string, unknown> = {};

  for (const key of CARD_FIELD_ORDER) {
    if (!(key in merged) || merged[key] === undefined) {
      result[key] = ARRAY_CARD_FIELDS.has(key) ? [] : '';
      continue;
    }
    let value = merged[key];

    if (key === 'personality' || key === 'tags') {
      value = joinStringOrArray(value, ', ');
    } else if (ARRAY_CARD_FIELDS.has(key)) {
      if (typeof value === 'string') {
        const t = value.trim();
        value = t ? [t] : [];
      } else if (!Array.isArray(value)) {
        value = value == null ? [] : [String(value)];
      } else {
        value = value.map((v) => String(v ?? ''));
      }
    } else if (typeof value !== 'string' && !Array.isArray(value)) {
      value = value == null ? '' : String(value);
    }

    if (DIALOGUE_CARD_FIELDS.has(key)) {
      if (typeof value === 'string') {
        value = rewriteSpeakerLabels(value, charName);
      } else if (Array.isArray(value)) {
        value = value.map((v) => rewriteSpeakerLabels(String(v ?? ''), charName));
      }
    }

    if (typeof value === 'string') {
      value = sanitizeCardText(value, key);
    } else if (Array.isArray(value)) {
      value = value.map((v) => (typeof v === 'string' ? sanitizeCardText(v, key) : v));
    }

    result[key] = value;
  }

  return result;
}

/* ============================================================
   PROVIDERS, BYOK, TIMEOUTS, STREAMING WATCHDOG
   ============================================================ */

type ProviderId = 'venice' | 'openrouter' | 'oneprovider';

const PROVIDER_ORDER: ProviderId[] = ['venice', 'openrouter', 'oneprovider'];

const VENICE_CHAT_URL = 'https://api.venice.ai/api/v1/chat/completions';
const VENICE_MODELS_URL = 'https://api.venice.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const ONEPROVIDER_CHAT_URL = 'https://api.oneprovider.dev/v1/chat/completions';
const ONEPROVIDER_MODELS_URL = 'https://api.oneprovider.dev/v1/models';

// Primary Venice authoring model (D1): general instruct, NOT RP/uncensored persona.
const VENICE_CARD_MODEL = 'zai-org-glm-4.7-flash';
const OPENROUTER_FALLBACK_MODELS = [
  'cognitivecomputations/dolphin-mistral-24b-venice-edition',
  'sao10k/l3.3-euryale-70b',
  'gryphe/mythomax-l2-13b',
  'google/gemma-4-31b-it:free',
];
const ONEPROVIDER_FALLBACK_MODELS = [
  'grok-4.7',
  'glm-5.3-flash',
];

const VENICE_STALL_MS = 20_000;
const VENICE_MAX_WALL_MS = 110_000;
const VENICE_MAX_ATTEMPTS = 2;
const VENICE_RETRY_BASE_MS = 700;

const PROVIDER_TIMEOUT_MS = 45_000;
const FETCH_URL_TIMEOUT_MS = 15_000;
const LIST_MODELS_TIMEOUT_MS = 10_000;

const CARD_JSON_MAX_TOKENS = 4096;
const PROMPT_VAR_MAX_TOKENS = 512;
const PROMPT_ALL_VARS_MAX_TOKENS = 2048;
const RAW_CONTEXT_MAX_CHARS = 120_000;

const OPENROUTER_HEADERS: Record<string, string> = {
  'HTTP-Referer': 'https://www.companionhub.app',
  'X-Title': 'AI Companion Hub',
};

type ResolvedRequestConfig = {
  byok: Partial<Record<ProviderId, string>>;
  models: {
    venice?: string;
    openrouter?: string[];
    oneprovider?: string[];
  };
  preferredProvider: ProviderId;
  allowSharedFallback: boolean;
  temperatureOverride?: number;
};

function isProviderId(value: unknown): value is ProviderId {
  return value === 'venice' || value === 'openrouter' || value === 'oneprovider';
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanStringList(value: unknown): string[] {
  if (typeof value === 'string') {
    const s = value.trim();
    return s ? [s] : [];
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === 'string' && item.trim() && !out.includes(item.trim())) {
        out.push(item.trim());
      }
    }
    return out;
  }
  return [];
}

function resolveRequestConfig(body: Record<string, unknown>): ResolvedRequestConfig {
  const rawByok = body.byok && typeof body.byok === 'object' && !Array.isArray(body.byok)
    ? (body.byok as Record<string, unknown>)
    : {};
  const veniceByok = cleanString(rawByok.venice);
  const openrouterByok = cleanString(rawByok.openrouter) || cleanString(body.openrouterKey);
  const oneproviderByok = cleanString(rawByok.oneprovider);

  const byok: Partial<Record<ProviderId, string>> = {};
  if (veniceByok) byok.venice = veniceByok;
  if (openrouterByok) byok.openrouter = openrouterByok;
  if (oneproviderByok) byok.oneprovider = oneproviderByok;

  const hasAnyByok = Object.keys(byok).length > 0;

  const rawModels = body.models && typeof body.models === 'object' && !Array.isArray(body.models)
    ? (body.models as Record<string, unknown>)
    : {};
  const legacyOrModel = cleanString(body.openrouterModel);
  const veniceModel = cleanString(rawModels.venice) || undefined;
  const openrouterModels = cleanStringList(rawModels.openrouter);
  if (legacyOrModel && !openrouterModels.includes(legacyOrModel)) {
    openrouterModels.unshift(legacyOrModel);
  }
  const oneproviderModels = cleanStringList(rawModels.oneprovider);

  const preferredProvider: ProviderId = isProviderId(body.preferredProvider)
    ? body.preferredProvider
    : hasAnyByok
      ? (PROVIDER_ORDER.find((p) => Boolean(byok[p])) || 'venice')
      : 'venice';

  // Q1: When any BYOK key is set, default allowSharedFallback is false.
  const allowSharedFallback = typeof body.allowSharedFallback === 'boolean'
    ? body.allowSharedFallback
    : !hasAnyByok;

  let temperatureOverride: number | undefined;
  if (typeof body.temperature === 'number' && Number.isFinite(body.temperature)) {
    temperatureOverride = Math.max(0, Math.min(1.2, body.temperature));
  }

  return {
    byok,
    models: {
      venice: veniceModel,
      openrouter: openrouterModels.length ? openrouterModels : undefined,
      oneprovider: oneproviderModels.length ? oneproviderModels : undefined,
    },
    preferredProvider,
    allowSharedFallback,
    temperatureOverride,
  };
}

function resolveTemperature(cfg: ResolvedRequestConfig, fallback: number): number {
  return cfg.temperatureOverride !== undefined ? cfg.temperatureOverride : fallback;
}

function uniqueModels(explicit: string[] | undefined, defaults: string[]): string[] {
  const list: string[] = [];
  if (explicit) {
    for (const m of explicit) {
      const t = m.trim();
      if (t && !list.includes(t)) list.push(t);
    }
  }
  for (const m of defaults) {
    if (!list.includes(m)) list.push(m);
  }
  return list;
}

function modelsForProvider(provider: ProviderId, cfg: ResolvedRequestConfig, override?: string): string[] {
  if (provider === 'venice') {
    const primary = override || cfg.models.venice || VENICE_CARD_MODEL;
    return [primary];
  }
  if (provider === 'openrouter') {
    const explicit = override ? [override, ...(cfg.models.openrouter || [])] : cfg.models.openrouter;
    return uniqueModels(explicit, OPENROUTER_FALLBACK_MODELS);
  }
  const explicit = override ? [override, ...(cfg.models.oneprovider || [])] : cfg.models.oneprovider;
  return uniqueModels(explicit, ONEPROVIDER_FALLBACK_MODELS);
}

function serverKeyFor(provider: ProviderId): string {
  if (provider === 'venice') return (Deno.env.get('VENICE_API_KEY') || '').trim();
  if (provider === 'openrouter') return (Deno.env.get('OPENROUTER_API_KEY') || '').trim();
  return (Deno.env.get('ONEPROVIDER_API_KEY') || '').trim();
}

function providerLabel(provider: ProviderId): string {
  if (provider === 'venice') return 'Venice';
  if (provider === 'openrouter') return 'OpenRouter';
  return 'OneProvider';
}

type ProviderAttempt = {
  provider: ProviderId;
  model: string;
  apiKey: string;
  source: 'byok' | 'server';
};

function buildProviderAttempts(
  cfg: ResolvedRequestConfig,
  modelOverrides?: Partial<Record<ProviderId, string>>,
): ProviderAttempt[] {
  const orderedProviders: ProviderId[] = [
    cfg.preferredProvider,
    ...PROVIDER_ORDER.filter((p) => p !== cfg.preferredProvider),
  ];

  const byokProviders = orderedProviders.filter((p) => Boolean(cfg.byok[p]));
  const hasAnyByok = byokProviders.length > 0;
  const attempts: ProviderAttempt[] = [];

  if (hasAnyByok) {
    for (const provider of byokProviders) {
      const key = cfg.byok[provider]!;
      const models = modelsForProvider(provider, cfg, modelOverrides?.[provider]);
      for (const model of models) {
        attempts.push({ provider, model, apiKey: key, source: 'byok' });
      }
    }
    if (!cfg.allowSharedFallback) {
      return attempts;
    }
  }

  for (const provider of orderedProviders) {
    const key = serverKeyFor(provider);
    if (!key) continue;
    // Do not repeat identical key if visitor happened to paste the server key
    if (cfg.byok[provider] && cfg.byok[provider] === key) continue;
    const models = modelsForProvider(provider, cfg, modelOverrides?.[provider]);
    for (const model of models) {
      attempts.push({ provider, model, apiKey: key, source: 'server' });
    }
  }

  return attempts;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVeniceRetryable(msg: string): boolean {
  return /stall|hung|timeout|wall|network|connection|abort|fetch|5\d\d|429|rate.?limit|truncated|incomplete|invalid JSON|returned empty/i.test(msg);
}

function clarifyFailure(provider: string, msg: string): string {
  if (/429|rate.?limit/i.test(msg)) return `${provider}: rate-limited (429)`;
  if (/returned empty|\(0 chars\)/i.test(msg)) return `${provider}: returned empty (0 chars)`;
  if (/truncated|incomplete JSON/i.test(msg)) return `${provider}: truncated/incomplete JSON`;
  return `${provider}: ${msg}`;
}

function formatCascadeFailure(kind: 'whole-card' | 'generic', failures: string[]): string {
  const joined = failures.join(' | ');
  if (kind === 'whole-card') return `All LLM providers failed whole-card JSON. ${joined}`;
  return `All LLM providers failed. ${joined}`;
}

function trimRawContext(raw: unknown, max = RAW_CONTEXT_MAX_CHARS): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Stream Venice chat completions; abort only if stalled or past max wall clock. */
async function callVeniceStreaming(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
    stream: true,
    venice_parameters: { include_venice_system_prompt: false },
  };

  const controller = new AbortController();
  const started = Date.now();
  let lastChunkAt = started;
  let settled = false;

  const watchdog = setInterval(() => {
    if (settled) return;
    const now = Date.now();
    if (now - started > VENICE_MAX_WALL_MS) {
      settled = true;
      controller.abort('venice-wall');
      return;
    }
    if (now - lastChunkAt > VENICE_STALL_MS) {
      settled = true;
      controller.abort('venice-stall');
    }
  }, 1000);

  let response: Response;
  try {
    response = await fetch(VENICE_CHAT_URL, {
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
      if (reason.includes('wall')) {
        throw new Error(`hung: wall clock exceeded ${VENICE_MAX_WALL_MS}ms`);
      }
      throw new Error(`hung: no chunk for ${VENICE_STALL_MS}ms (stall before headers)`);
    }
    throw e;
  }

  if (!response.ok) {
    clearInterval(watchdog);
    await response.text().catch(() => '');
    throw new Error(`LLM API error: ${response.status}`);
  }

  if (!response.body) {
    clearInterval(watchdog);
    throw new Error('hung: empty Venice stream body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let sawChunk = false;

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
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          settled = true;
          clearInterval(watchdog);
          return content;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length) {
            content += delta;
            lastChunkAt = Date.now();
          }
          const full = parsed?.choices?.[0]?.message?.content;
          if (!delta && typeof full === 'string' && full.length) {
            content = full;
            lastChunkAt = Date.now();
          }
        } catch {
          // ignore partial JSON chunk
        }
      }
    }
  } catch (e) {
    clearInterval(watchdog);
    if (controller.signal.aborted) {
      const reason = String(controller.signal.reason || '');
      if (reason.includes('wall')) {
        throw new Error(`hung: wall clock exceeded ${VENICE_MAX_WALL_MS}ms after ${content.length} chars`);
      }
      throw new Error(`hung: no chunk for ${VENICE_STALL_MS}ms after ${content.length} chars`);
    }
    throw e;
  } finally {
    settled = true;
    clearInterval(watchdog);
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (!content || !content.trim()) {
    throw new Error(sawChunk ? 'hung: stream ended with empty content' : 'hung: connection died with no chunks');
  }
  return content;
}

async function callProvider(
  url: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  timeoutMs = PROVIDER_TIMEOUT_MS,
  extraHeaders?: Record<string, string>,
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(extraHeaders || {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content || !String(content).trim()) {
    throw new Error('returned empty (0 chars)');
  }
  return content;
}

async function runAttempt(
  attempt: ProviderAttempt,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  if (attempt.provider === 'venice') {
    return await callVeniceStreaming(
      attempt.apiKey,
      attempt.model,
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature,
    );
  }
  if (attempt.provider === 'openrouter') {
    return await callProvider(
      OPENROUTER_CHAT_URL,
      attempt.apiKey,
      attempt.model,
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature,
      PROVIDER_TIMEOUT_MS,
      OPENROUTER_HEADERS,
    );
  }
  return await callProvider(
    ONEPROVIDER_CHAT_URL,
    attempt.apiKey,
    attempt.model,
    systemPrompt,
    userPrompt,
    maxTokens,
    temperature,
    PROVIDER_TIMEOUT_MS,
  );
}

/**
 * Provider cascade that ONLY accepts complete, parseable whole-card JSON (R8).
 * Truncated or invalid JSON is treated as a retryable/fallthrough failure.
 */
async function callLLMForWholeCard(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  cfg: ResolvedRequestConfig,
): Promise<{ content: string; provider: ProviderId; card: Record<string, unknown> }> {
  const attempts = buildProviderAttempts(cfg);
  const failures: string[] = [];

  for (const attempt of attempts) {
    const label = providerLabel(attempt.provider);
    const maxTries = attempt.provider === 'venice' ? VENICE_MAX_ATTEMPTS : 1;

    for (let tryNum = 1; tryNum <= maxTries; tryNum++) {
      try {
        const content = await runAttempt(attempt, systemPrompt, userPrompt, maxTokens, temperature);
        if (!content || !String(content).trim()) {
          throw new Error('returned empty (0 chars)');
        }
        if (looksLikeTruncatedCardJson(content)) {
          throw new Error(`truncated/incomplete JSON (${content.length} chars)`);
        }
        const { card, parseError } = parseWholeCardJson(content, { rejectTruncated: true });
        if (!parseError && card) {
          const flat = sanitizeWholeCardFields(normalizeWholeCardToHub(card));
          return { content, provider: attempt.provider, card: flat };
        }
        throw new Error(`invalid JSON (${content.length} chars)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`${attempt.provider} card attempt ${tryNum}/${maxTries} failed (${attempt.model}):`, msg);
        failures.push(clarifyFailure(label, msg));
        if (attempt.provider !== 'venice' || !isVeniceRetryable(msg) || tryNum >= maxTries) {
          break;
        }
        const backoff = VENICE_RETRY_BASE_MS * tryNum;
        await sleepMs(backoff);
      }
    }
  }

  if (failures.length === 0) {
    throw new Error('No API keys configured (VENICE_API_KEY, OPENROUTER_API_KEY, or ONEPROVIDER_API_KEY).');
  }
  throw new Error(formatCascadeFailure('whole-card', failures));
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  cfg: ResolvedRequestConfig,
  modelOverrides?: Partial<Record<ProviderId, string>>,
): Promise<{ content: string; provider: ProviderId }> {
  const attempts = buildProviderAttempts(cfg, modelOverrides);
  const failures: string[] = [];

  for (const attempt of attempts) {
    const label = providerLabel(attempt.provider);
    const maxTries = attempt.provider === 'venice' ? VENICE_MAX_ATTEMPTS : 1;

    for (let tryNum = 1; tryNum <= maxTries; tryNum++) {
      try {
        const content = await runAttempt(attempt, systemPrompt, userPrompt, maxTokens, temperature);
        if (!content || !String(content).trim()) {
          throw new Error('returned empty (0 chars)');
        }
        return { content, provider: attempt.provider };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`${attempt.provider} attempt ${tryNum}/${maxTries} failed (${attempt.model}):`, msg);
        failures.push(clarifyFailure(label, msg));
        if (attempt.provider !== 'venice' || !isVeniceRetryable(msg) || tryNum >= maxTries) {
          break;
        }
        const backoff = VENICE_RETRY_BASE_MS * tryNum;
        await sleepMs(backoff);
      }
    }
  }

  if (failures.length === 0) {
    throw new Error('No API keys configured (VENICE_API_KEY, OPENROUTER_API_KEY, or ONEPROVIDER_API_KEY).');
  }
  throw new Error(formatCascadeFailure('generic', failures));
}

/* ============================================================
   LIVE MODEL CATALOG (R4)
   ============================================================ */

type ModelEntry = {
  id: string;
  name: string;
  contextLength?: number;
};

async function fetchProviderModels(
  provider: ProviderId,
  apiKey?: string,
): Promise<{ models: ModelEntry[]; error?: string }> {
  const url = provider === 'venice'
    ? VENICE_MODELS_URL
    : provider === 'openrouter'
      ? OPENROUTER_MODELS_URL
      : ONEPROVIDER_MODELS_URL;

  if (provider !== 'openrouter' && !apiKey) {
    return { models: [], error: 'No API key configured' };
  }

  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (provider === 'openrouter') Object.assign(headers, OPENROUTER_HEADERS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIST_MODELS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      await res.text().catch(() => '');
      return { models: [], error: `HTTP ${res.status}` };
    }
    const payload = await res.json();
    const list: unknown[] = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload)
          ? payload
          : [];

    const models: ModelEntry[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      // On Venice, skip image/tts/embedding-only SKUs when type is explicitly non-text
      if (provider === 'venice' && typeof rec.type === 'string' && rec.type !== 'text') continue;
      const id = cleanString(rec.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const spec = rec.model_spec && typeof rec.model_spec === 'object'
        ? (rec.model_spec as Record<string, unknown>)
        : null;
      const name = cleanString(rec.name) || cleanString(spec?.name) || id;
      const ctxRaw = rec.context_length ?? spec?.availableContextTokens ?? rec.context_window;
      const contextLength = typeof ctxRaw === 'number' && Number.isFinite(ctxRaw) ? ctxRaw : undefined;
      models.push(contextLength ? { id, name, contextLength } : { id, name });
    }
    return { models };
  } catch (e) {
    const msg = controller.signal.aborted
      ? `timeout after ${LIST_MODELS_TIMEOUT_MS}ms`
      : (e instanceof Error ? e.message : String(e));
    return { models: [], error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   SINGLE-FIELD RESPONSE CLEANUP
   ============================================================ */

function cleanSingleFieldOutput(raw: string, fieldKey: string, charName: string): unknown {
  let text = stripThinkingBlocks(String(raw ?? '').trim());
  const fence = text.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n?```$/);
  if (fence) text = fence[1].trim();

  // If the model wrapped an array field in a JSON object like {"alternate_greetings": [...]}
  if (ARRAY_CARD_FIELDS.has(fieldKey)) {
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        const obj = JSON.parse(text);
        if (obj && typeof obj === 'object' && Array.isArray(obj[fieldKey])) {
          return (obj[fieldKey] as unknown[]).map((item) => {
            const s = String(item ?? '').trim();
            return sanitizeCardText(
              DIALOGUE_CARD_FIELDS.has(fieldKey) ? rewriteSpeakerLabels(s, charName) : s,
              fieldKey,
            );
          }).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }
    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) {
          return arr.map((item) => {
            const s = String(item ?? '').trim();
            return sanitizeCardText(
              DIALOGUE_CARD_FIELDS.has(fieldKey) ? rewriteSpeakerLabels(s, charName) : s,
              fieldKey,
            );
          }).filter(Boolean);
        }
      } catch {
        // fall through to blank-line split below
      }
    }
    const items = text
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => sanitizeCardText(
        DIALOGUE_CARD_FIELDS.has(fieldKey) ? rewriteSpeakerLabels(s, charName) : s,
        fieldKey,
      ));
    return fieldKey === 'alternate_greetings' ? items.slice(0, 3) : items;
  }

  // If the model accidentally returned {"fieldKey": "..."} for a string field, unwrap it.
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object' && typeof obj[fieldKey] === 'string') {
        text = obj[fieldKey];
      }
    } catch {
      // keep raw text
    }
  }

  if (DIALOGUE_CARD_FIELDS.has(fieldKey)) {
    text = rewriteSpeakerLabels(text, charName);
  }
  return sanitizeCardText(text, fieldKey);
}

/* ============================================================
   HTTP HANDLER
   ============================================================ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = cleanString(body?.action);
    const cfg = resolveRequestConfig(body);

    // === HEALTH CHECK ===
    if (action === 'health') {
      const providers = {
        venice: Boolean(serverKeyFor('venice')),
        openrouter: Boolean(serverKeyFor('openrouter')),
        oneprovider: Boolean(serverKeyFor('oneprovider')),
      };
      const hasProviderKey = providers.venice || providers.openrouter || providers.oneprovider;
      const payload = hasProviderKey
        ? { ok: true, providers, provider: 'edge' }
        : {
            ok: false,
            providers,
            provider: 'edge',
            reason: 'No server AI provider key is configured (VENICE_API_KEY, OPENROUTER_API_KEY, or ONEPROVIDER_API_KEY).',
          };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === LIVE MODEL CATALOG (R4) ===
    if (action === 'list-models') {
      const veniceKey = cfg.byok.venice || serverKeyFor('venice') || undefined;
      const openrouterKey = cfg.byok.openrouter || serverKeyFor('openrouter') || undefined;
      const oneproviderKey = cfg.byok.oneprovider || serverKeyFor('oneprovider') || undefined;

      const [veniceRes, openrouterRes, oneproviderRes] = await Promise.all([
        fetchProviderModels('venice', veniceKey),
        fetchProviderModels('openrouter', openrouterKey),
        fetchProviderModels('oneprovider', oneproviderKey),
      ]);

      const errors: Partial<Record<ProviderId, string>> = {};
      if (veniceRes.error) errors.venice = veniceRes.error;
      if (openrouterRes.error) errors.openrouter = openrouterRes.error;
      if (oneproviderRes.error) errors.oneprovider = oneproviderRes.error;

      return new Response(JSON.stringify({
        models: {
          venice: veniceRes.models,
          openrouter: openrouterRes.models,
          oneprovider: oneproviderRes.models,
        },
        ...(Object.keys(errors).length > 0 ? { errors } : {}),
        provider: 'edge',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === FETCH URL (Doc Consolidator) ===
    if (action === 'fetch-url') {
      const url = cleanString(body.url);
      if (!url) {
        return new Response(JSON.stringify({ error: 'url is required', provider: 'edge' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid URL', provider: 'edge' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return new Response(JSON.stringify({ error: 'Only http/https URLs are supported', provider: 'edge' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_URL_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(parsedUrl.toString(), {
          headers: {
            'User-Agent': 'AI-Companion-Hub-DocProxy/1.0',
            'Accept': 'text/html,text/plain,application/xhtml+xml,*/*',
          },
          redirect: 'follow',
          signal: controller.signal,
        });
      } catch (e) {
        if (controller.signal.aborted) {
          return new Response(JSON.stringify({ error: 'Request timed out after 15 seconds.', provider: 'edge' }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        return new Response(JSON.stringify({ error: `Failed to fetch URL (HTTP ${response.status})`, provider: 'edge' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const contentType = response.headers.get('content-type') || '';
      const raw = await response.text();

      let text = raw;
      if (contentType.includes('text/html') || raw.trimStart().toLowerCase().startsWith('<!doctype') || raw.trimStart().toLowerCase().startsWith('<html')) {
        text = raw
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/&#39;|&apos;/gi, "'")
          .replace(/\s+/g, ' ')
          .trim();
      }

      const truncated = text.length > 32000;
      const finalText = truncated ? text.slice(0, 32000) : text;

      return new Response(JSON.stringify({ text: finalText, truncated, url: parsedUrl.toString(), provider: 'edge' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === DOC CONSOLIDATOR ===
    if (action === 'consolidate') {
      const serviceName = cleanString(body.serviceName);
      const text = cleanString(body.text);
      if (!serviceName || !text) {
        return new Response(JSON.stringify({ error: 'serviceName and text are required', provider: 'edge' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const prompt = `Consolidate this documentation into a structured markdown expert file for ${serviceName}. Include:
1. **Overview** - Brief description
2. **Setup Steps** - Step-by-step guide
3. **Character Creation Guide**
4. **API Configuration**
5. **NSFW Settings**
6. **Features**
7. **Troubleshooting**

Format with clear markdown headings, bullet points, and code blocks. Be comprehensive but concise.

Documentation:
${text}`;

      const { content: result, provider } = await callLLM(
        'You are a technical documentation specialist. Consolidate raw documentation into clean, structured markdown.',
        prompt,
        CARD_JSON_MAX_TOKENS,
        resolveTemperature(cfg, 0.3),
        cfg,
      );
      const trimmed = stripThinkingBlocks(result).trim();
      if (!trimmed) {
        return new Response(JSON.stringify({ error: 'AI returned an empty result', provider }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ result: trimmed, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CHARACTER CARD: GENERATE SINGLE FIELD (D7: targeted plain-text ONLY) ===
    if (action === 'generate-field') {
      const fieldName = cleanString(body.fieldName);
      if (!fieldName) {
        return new Response(JSON.stringify({ error: 'fieldName is required', provider: 'edge' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const existingFields = body.existingFields && typeof body.existingFields === 'object' && !Array.isArray(body.existingFields)
        ? (body.existingFields as Record<string, unknown>)
        : null;
      const specVersion = cleanString(body.specVersion);
      const isV3 = specVersion === 'v3' || specVersion === 'V3';
      const notes = cleanString(body.refinementNotes);
      const clientDraft = typeof body.currentValue === 'string' ? body.currentValue : '';
      const charName = existingFields ? joinStringOrArray(existingFields.name).trim() : '';
      const existingDraft = formatExistingFieldValue(existingFields?.[fieldName], fieldName, charName) || '';
      const draft = clientDraft.trim() || existingDraft;
      const useRefine = notes.length > 0 && draft.length > 0;
      const maxTok = FIELD_MAX_TOKENS[fieldName] ?? 512;
      const temp = resolveTemperature(cfg, 0.7);

      if (useRefine) {
        const prompt = buildRefinementFieldPrompt(fieldName, draft, notes, existingFields, isV3, body.brief);
        const { content: raw, provider } = await callLLM(SINGLE_FIELD_SYSTEM, prompt, maxTok, temp, cfg);
        const fieldValue = cleanSingleFieldOutput(raw, fieldName, charName);
        return new Response(
          JSON.stringify({ result: fieldValue, fieldName, wholeCardBuilt: false, refined: true, provider }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const prompt = buildSingleFieldUserPrompt(fieldName, existingFields, isV3, body.brief);
      const { content: raw, provider } = await callLLM(SINGLE_FIELD_SYSTEM, prompt, maxTok, temp, cfg);
      const fieldValue = cleanSingleFieldOutput(raw, fieldName, charName);
      return new Response(
        JSON.stringify({ result: fieldValue, fieldName, wholeCardBuilt: false, refined: false, provider }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // === CHARACTER CARD: GENERATE ALL FIELDS ===
    if (action === 'generate-all') {
      const existingFields = body.existingFields && typeof body.existingFields === 'object' && !Array.isArray(body.existingFields)
        ? (body.existingFields as Record<string, unknown>)
        : null;
      const specVersion = cleanString(body.specVersion);
      const isV3 = specVersion === 'v3' || specVersion === 'V3';
      const notes = cleanString(body.refinementNotes);
      const useRefine = notes.length > 0;

      let prompt = buildWholeCardUserPrompt(existingFields, isV3, body.brief);
      if (useRefine) {
        prompt += buildRefineAllAppendix(notes);
        prompt += `\n\nGENERATE-ALL REFINE MODE: Return the complete revised card JSON. Client will apply every field.`;
      } else {
        prompt += `\n\nGENERATE-ALL MODE: Return the complete card JSON. Client will apply every field.`;
      }

      const { provider, card } = await callLLMForWholeCard(
        CARD_AUTHOR_SYSTEM,
        prompt,
        CARD_JSON_MAX_TOKENS,
        resolveTemperature(cfg, 0.7),
        cfg,
      );

      const flatHubCard = sanitizeWholeCardFields(normalizeWholeCardToHub(card));
      return new Response(
        JSON.stringify({ result: flatHubCard, provider, refined: useRefine }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // === CHARACTER CARD: CONVERT / IMPORT ===
    if (action === 'convert-character') {
      const inputText = cleanString(body.inputText);
      const outputFormat = cleanString(body.outputFormat);
      if (!inputText) {
        return new Response(JSON.stringify({ error: 'inputText is required', provider: 'edge' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const prompt = `You are given character data in an unknown format. Parse ALL the information and convert it into a ${outputFormat || 'V2/V3 compatible'} character card format.

INPUT DATA:
${inputText}

INSTRUCTIONS:
1. Identify all character information regardless of format (Character.AI, Pygmalion, W++, SBF, plain text, JSON, YAML, CCv2, CCv3, or any other format)
2. Map every piece of information to the most appropriate field
3. If info doesn't map directly, place it in the most logical field (description or personality usually)
4. ALL input text must be accounted for — nothing should be discarded
5. Return ONLY valid JSON matching:
${RESPONSE_SCHEMA_TEMPLATE}

Return ONLY the JSON object, no explanation.`;

      const { content: rawResult, provider } = await callLLM(
        `${CHARACTER_CARD_STUDIO_SKILL_RULES}\n\nYou are a character card format conversion expert. Parse any character format and convert to V2/V3 spec without discarding information. Respond with valid JSON only.`,
        prompt,
        CARD_JSON_MAX_TOKENS,
        resolveTemperature(cfg, 0.3),
        cfg,
      );

      const { card, parseError } = parseWholeCardJson(rawResult);
      if (parseError || !card) {
        return new Response(JSON.stringify({ result: rawResult, parseError: true, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const flatHubCard = sanitizeWholeCardFields(normalizeWholeCardToHub(card));
      return new Response(JSON.stringify({ result: flatHubCard, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PROMPT BUILDER: GENERATE VARIABLE ===
    if (action === 'generate-prompt-variable') {
      const variableName = cleanString(body.variableName);
      if (!variableName) {
        return new Response(JSON.stringify({ error: 'variableName is required', provider: 'edge' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const variableDescription = cleanString(body.variableDescription);
      const templateContext = typeof body.templateContext === 'string' ? body.templateContext : '';
      const existingVariables = body.existingVariables && typeof body.existingVariables === 'object' ? body.existingVariables as Record<string, unknown> : null;
      const cappedRaw = trimRawContext(body.rawContext);

      const contextParts: string[] = [];
      if (existingVariables) {
        for (const [key, value] of Object.entries(existingVariables)) {
          if (typeof value === 'string' && value.trim()) {
            contextParts.push(`${key}: ${value}`);
          }
        }
      }

      const prompt = `Generate creative content for the template variable "${variableName}".
${variableDescription ? `Purpose: ${variableDescription}` : ''}
${templateContext ? `This variable is used in this template:\n${templateContext}` : ''}
${contextParts.length > 0 ? `Other filled variables:\n${contextParts.join('\n')}` : ''}
${cappedRaw ? `\nADDITIONAL RAW CONTEXT (use this as source material — extract relevant details for this variable):\n${cappedRaw}` : ''}

Write ONLY the variable value — no labels, no quotes around it, no explanation. Be creative and stay consistent with any existing context. If raw context is provided, extract and adapt relevant information for this specific variable.`;

      const { content: result, provider } = await callLLM(
        'You are a creative writer specializing in AI roleplay prompts, scenarios, and character definitions. Generate concise, fitting content for prompt template variables. When given raw context, intelligently extract and distribute relevant information.',
        prompt,
        PROMPT_VAR_MAX_TOKENS,
        resolveTemperature(cfg, 0.8),
        cfg,
      );

      const cleaned = stripThinkingBlocks(result).trim();
      return new Response(JSON.stringify({ result: cleaned, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PROMPT BUILDER: GENERATE ALL VARIABLES ===
    if (action === 'generate-all-prompt-variables') {
      const { templateName, templateDescription, template, variables, existingVariables, rawContext } = body;
      if (!variables || !Array.isArray(variables)) {
        return new Response(JSON.stringify({ error: 'variables array is required', provider: 'edge' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const cappedRaw = trimRawContext(rawContext);
      const contextParts: string[] = [];
      if (existingVariables && typeof existingVariables === 'object') {
        for (const [key, value] of Object.entries(existingVariables as Record<string, unknown>)) {
          if (typeof value === 'string' && value.trim()) {
            contextParts.push(`${key}: ${value}`);
          }
        }
      }

      type PromptVariable = { name: string; description: string; placeholder: string };
      const promptVariables = variables.filter((variable: unknown): variable is PromptVariable => {
        if (!variable || typeof variable !== 'object') return false;
        const candidate = variable as Record<string, unknown>;
        return typeof candidate.name === 'string'
          && typeof candidate.description === 'string'
          && typeof candidate.placeholder === 'string';
      });
      const varList = promptVariables.map((variable) => `- ${variable.name}: ${variable.description} (example: ${variable.placeholder})`).join('\n');

      const prompt = `Generate ALL variables for the "${cleanString(templateName)}" prompt template.
Template description: ${cleanString(templateDescription)}

Template:
${typeof template === 'string' ? template : ''}

Variables to generate:
${varList}

${contextParts.length > 0 ? `EXISTING CONTENT (use as foundation — expand, enhance, stay consistent. Treat existing text as seeds to build from):\n${contextParts.join('\n')}` : 'No variables filled yet — create original, compelling content.'}
${cappedRaw ? `\nRAW CONTEXT (use this as primary source material — extract, adapt, and distribute relevant information into the most appropriate variables):\n${cappedRaw}` : ''}

RESPOND IN VALID JSON FORMAT ONLY. The JSON should have each variable name as a key and the generated content as the value.
Generate ALL variables listed above. Every variable must have a value. Stay consistent across all variables. If raw context or existing content is provided, use it as the foundation — enhance and flesh out, don't just copy.`;

      const { content: result, provider } = await callLLM(
        'You are a creative writer specializing in AI roleplay prompts, scenarios, lorebook entries, and character definitions. Generate rich, detailed, consistent content for all prompt template variables. When given raw context, intelligently extract and distribute relevant information into appropriate variables. ALWAYS respond with valid JSON only — no markdown, no explanation.',
        prompt,
        PROMPT_ALL_VARS_MAX_TOKENS,
        resolveTemperature(cfg, 0.8),
        cfg,
      );

      const cleaned = stripThinkingBlocks(result);
      let parsed: Record<string, string> = {};
      try {
        const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const jsonText = fence ? fence[1].trim() : cleaned.trim();
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            parsed = JSON.parse(repairJsonString(jsonMatch[0]));
          }
        }
      } catch {
        return new Response(JSON.stringify({ result, parseError: true, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ result: parsed, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action', provider: 'edge' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    const message = error instanceof Error ? error.message : 'Unknown error';
    const upstream = /LLM API error|timeout|hung|All LLM providers failed|No API keys configured/i.test(message);
    const status = upstream ? 502 : 500;
    return new Response(JSON.stringify({ error: message, provider: 'edge' }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
