const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};


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

Good shape (3 blocks; keep each exchange multi-line but concise):
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

/** Voice Anchor rules — embed in the SAME whole-card prompt (no separate Phase-1 API). */
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

/** CCV2/V3 field bible baked into every character generate call. */
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
  NOT mid-scene Venice roleplay. NOT first-person {{user}}. Budget <=1500 chars.
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

function joinStringOrArray(value: unknown, sep = ", "): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean).join(sep);
  }
  if (value == null) return "";
  return String(value);
}

function rewriteSpeakerLabels(text: string, charName: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/(^|\n)\s*User\s*:/g, "$1{{user}}:");
  const name = (charName || "").trim();
  if (!name) return out;
  const variants = new Set<string>();
  variants.add(name);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    variants.add(parts[0]);
    variants.add(parts[parts.length - 1]);
  }
  for (const variant of variants) {
    const esc = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp("(^|\\n)\\s*" + esc + "\\s*:", "gi"), "$1{{char}}:");
  }
  return out;
}


/** Edge mirror of client sanitizeCardMacros. */
function sanitizeCardText(text: string, fieldName?: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/\{\{\s*User\s*\}\}/g, '{{user}}');
  out = out.replace(/\{\{\s*Char\s*\}\}/g, '{{char}}');
  out = out.replace(/\{\{\s*USER\s*\}\}/g, '{{user}}');
  out = out.replace(/\{\{\s*CHAR\s*\}\}/g, '{{char}}');
  out = out.replace(/\{\{\s*User'?s\s*\}\}/gi, "{{user}}'s");
  out = out.replace(/\{\{\s*user'?s\s*\}\}/g, "{{user}}'s");
  out = out.replace(/\{\{\s*Char'?s\s*\}\}/gi, "{{char}}'s");
  out = out.replace(/\{\{\s*char'?s\s*\}\}/g, "{{char}}'s");
  out = out.replace(/\bThe User\b/g, '{{user}}');
  out = out.replace(/\bthe User\b/g, '{{user}}');
  // Case-insensitive: possessives BEFORE bare "the user"
  out = out.replace(/\bthe user's\b/gi, "{{user}}'s");
  out = out.replace(/\bthe user\b/gi, '{{user}}');
  out = out.replace(/(^|\n)\s*User\s*:/g, '$1{{user}}:');
  out = out.replace(/(^|\n)\s*Name\s*:/g, '$1{{char}}:');
  if (fieldName === 'description' || fieldName === 'personality') {
    out = out.replace(/^(\s*)You are\b/i, '$1{{char}} is');
  }
  return out;
}

function sanitizeWholeCardFields(card: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...card };
  for (const key of CARD_FIELD_ORDER) {
    if (!(key in out)) continue;
    const value = out[key];
    if (typeof value === 'string') {
      out[key] = sanitizeCardText(value, key);
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => (typeof v === 'string' ? sanitizeCardText(v, key) : v));
    }
  }
  return out;
}

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
  alternate_greetings: 'Three distinct full openers like first_mes (IC as {{char}}).',
  group_only_greetings: 'Group-chat openers acknowledging others; or empty.',
  source: 'Source URL strings if known.',
  creator: 'Creator handle if known.',
  character_version: 'Version string if useful.',
};

function fieldHasContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((v) => String(v ?? '').trim().length > 0);
  return false;
}

/** Hybrid gate: enough context => fast targeted single-field; else whole-card-then-slice. */
function hasEnoughSingleFieldContext(existingFields: Record<string, unknown> | null | undefined): boolean {
  if (!existingFields || typeof existingFields !== 'object') return false;
  let nonEmpty = 0;
  let combinedLen = 0;
  for (const key of CARD_FIELD_ORDER) {
    const value = existingFields[key];
    if (!fieldHasContent(value)) continue;
    nonEmpty += 1;
    if (typeof value === 'string') combinedLen += value.trim().length;
    else if (Array.isArray(value)) combinedLen += value.map((v) => String(v ?? '').trim()).filter(Boolean).join('\n').length;
  }
  return nonEmpty >= 2 || combinedLen >= 200;
}

function buildSingleFieldUserPrompt(fieldName: string, existingFields: Record<string, unknown> | null | undefined, isV3: boolean): string {
  const contextParts = collectContextParts(existingFields, CARD_FIELD_ORDER);
  const contextBlock = contextParts.length > 0
    ? `LABELED CURRENT CARD CONTEXT (non-empty fields):\n${contextParts.join('\n\n')}`
    : 'No other fields filled — invent from the field name and any keywords implied by empty context.';
  const pov = FIELD_POV_SNIPPETS[fieldName] || 'Follow the field bible for this key.';
  const bibleLine = (() => {
    const lines = CARD_FIELD_BIBLE.split('\n');
    const hit = lines.find((l) => l.trim().startsWith(`- ${fieldName}:`));
    return hit ? hit.trim() : `- ${fieldName}: follow CCV2/V3 field bible.`;
  })();
  return `${CARD_FIELD_BIBLE}

${FIELD_POV_CONTRACT}

${VOICE_ANCHOR_RULES}

${RELATIONAL_PHRASING_RULES}

${fieldName === 'mes_example' ? MES_EXAMPLE_FORMAT_RULES + '\n\n' : ''}TARGET FIELD: ${fieldName}
FIELD BIBLE: ${bibleLine}
${pov}

${contextBlock}

TASK: Write ONLY the text for "${fieldName}". Improve quality using the context. Stay consistent with Voice Anchor + POV.
MACRO RULES: lowercase {{user}}/{{char}} only; {{user}}'s not {{User's}}; no The User; no User:/Name: labels.
${isV3 ? 'V3 card context.' : 'V2-flat card context.'}

Respond with ONLY the field text, no JSON, no fences, no commentary.`;
}

function buildRefinementFieldPrompt(
  fieldName: string,
  currentValue: string,
  notes: string,
  existingFields: Record<string, unknown> | null | undefined,
  isV3: boolean,
): string {
  const contextParts = collectContextParts(existingFields, CARD_FIELD_ORDER);
  const contextBlock = contextParts.length > 0
    ? `LABELED CURRENT CARD CONTEXT (other fields for consistency):\n${contextParts.join('\n\n')}`
    : 'No other fields filled.';
  const pov = FIELD_POV_SNIPPETS[fieldName] || 'Follow the field bible for this key.';
  const bibleLine = (() => {
    const lines = CARD_FIELD_BIBLE.split('\n');
    const hit = lines.find((l) => l.trim().startsWith(`- ${fieldName}:`));
    return hit ? hit.trim() : `- ${fieldName}: follow CCV2/V3 field bible.`;
  })();
  return `${CARD_FIELD_BIBLE}

${FIELD_POV_CONTRACT}

${VOICE_ANCHOR_RULES}

${RELATIONAL_PHRASING_RULES}

${CHARACTER_CARD_STUDIO_SKILL_RULES}

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
${currentValue}

${contextBlock}

OUTPUT RULES:
- Keep the same field type/format (e.g. mes_example still exactly three <START> blocks with {{user}}:/{{char}}:; first_mes stays a single opener).
- Stay consistent with Voice Anchor + POV + relational phrasing + macro rules.
- MACRO RULES: lowercase {{user}}/{{char}} only; {{user}}'s not {{User's}}; no The User / the user; no User:/Name: labels.
${isV3 ? '- V3 card context.' : '- V2-flat card context.'}

Respond with ONLY the revised field text, no JSON, no fences, no commentary.`;
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
- Keep Hub flat JSON schema + RESPONSE_SCHEMA_TEMPLATE + POV/Voice Anchor/relational phrasing contracts above.
- Still return complete flat Hub JSON for every key (use "" or [] when empty).
- Enrich gaps only where the notes imply; do not wipe good prose that already fits the critique.
- first_mes remains a single opener; mes_example remains three progression <START> blocks with {{user}}:/{{char}}: only.`;
}




/**
 * Normalize foreign / nested whole-card JSON into flat Hub CardData keys only.
 * Does NOT invent character_book from lore; skips unknown wrappers after unwrap.
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

  // lore is not a Hub flat field — skip (do not invent character_book)
  if (Array.isArray(merged.personality)) {
    merged.personality = joinStringOrArray(merged.personality, ", ");
  }
  if (Array.isArray(merged.tags)) {
    merged.tags = joinStringOrArray(merged.tags, ", ");
  }

  const charName = joinStringOrArray(merged.name).trim();
  const result: Record<string, unknown> = {};

  for (const key of CARD_FIELD_ORDER) {
    if (!(key in merged) || merged[key] === undefined) {
      result[key] = ARRAY_CARD_FIELDS.has(key) ? [] : "";
      continue;
    }
    let value = merged[key];

    if (key === 'personality' || key === 'tags') {
      value = joinStringOrArray(value, ", ");
    } else if (ARRAY_CARD_FIELDS.has(key)) {
      if (typeof value === 'string') {
        const t = value.trim();
        value = t ? [t] : [];
      } else if (!Array.isArray(value)) {
        value = value == null ? [] : [String(value)];
      } else {
        value = value.map((v) => String(v ?? ""));
      }
    } else if (typeof value !== 'string' && !Array.isArray(value)) {
      value = value == null ? "" : String(value);
    }

    if (key === 'mes_example' || key === 'first_mes') {
      value = rewriteSpeakerLabels(String(value ?? ""), charName);
    } else if (key === 'alternate_greetings' && Array.isArray(value)) {
      value = value.map((v) => rewriteSpeakerLabels(String(v ?? ""), charName));
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

/** Strip thinking and reasoning blocks emitted by thinking/reasoning models. */
function stripThinkingBlocks(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/gi, '')
    .replace(/<think>[\s\S]*$/gi, '') // unclosed think block at end
    .trim();
}

/**
 * Resiliently repair invalid JSON string produced by LLMs:
 * - Replaces unescaped literal newlines/tabs inside string literals with \n and \t
 * - Escapes unescaped double quotes occurring inside string values (dialogue quotes)
 * - Removes trailing commas before } and ]
 * - Auto-closes truncated strings, arrays, and objects
 */
function repairJsonString(input: string): string {
  if (!input || typeof input !== 'string') return '{}';
  let str = input.trim();

  // Strip trailing commas before } or ]
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
        // Check if this is the actual closing quote of the key or value
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
        } else {
          // If followed by comma, closing brace/bracket, colon, or EOF -> genuine closing quote
          if (
            nextNonWs === ',' ||
            nextNonWs === '}' ||
            nextNonWs === ']' ||
            nextNonWs === '' ||
            nextNonWs === ':'
          ) {
            inString = false;
            result.push(ch);
          } else {
            // Dialogue or embedded quote -> escape it
            result.push('\\"');
          }
        }
        continue;
      }

      result.push(ch);
    } else {
      // Outside string literal
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
        if (stack.length > 0 && stack[stack.length - 1] === '{') {
          stack.pop();
        }
        result.push(ch);
      } else if (ch === '[') {
        stack.push('[');
        result.push(ch);
      } else if (ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') {
          stack.pop();
        }
        result.push(ch);
      } else {
        result.push(ch);
      }
    }
  }

  let repaired = result.join('');

  // Close open string if unclosed
  if (inString) {
    repaired += '"';
  }

  // Remove trailing commas after repairs
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Close open brackets/braces
  while (stack.length > 0) {
    const top = stack.pop();
    if (top === '{') repaired += '}';
    else if (top === '[') repaired += ']';
  }

  return repaired;
}

/** Fuzzy fallback extractor for standard CCV2/V3 card fields from malformed payloads. */
function extractCardFieldsFuzzy(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  const text = stripThinkingBlocks(raw);
  const result: Record<string, unknown> = {};

  for (const field of CARD_FIELD_ORDER) {
    // 1. Array fields: "field_name": [...]
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

    // 2. Multiline string field bounded by next known field key or ending brace
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

    // 3. Single-line string field
    const strMatch = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i').exec(text);
    if (strMatch) {
      result[field] = strMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .trim();
      continue;
    }
  }

  return Object.keys(result).length >= 2 ? result : null;
}

function parseWholeCardJson(raw: string): { card: Record<string, unknown> | null; parseError: boolean } {
  if (!raw || typeof raw !== 'string') return { card: null, parseError: true };

  // Step 1: Strip thinking blocks
  let text = stripThinkingBlocks(raw.trim());

  // Step 2: Strip code fences if present
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // Step 3: Find outermost object bounds
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
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

  // Tier 2: Resilient JSON repair (unescaped newlines/quotes, trailing commas, truncated brackets)
  try {
    const repaired = repairJsonString(text);
    const parsed = JSON.parse(repaired);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { card: parsed as Record<string, unknown>, parseError: false };
    }
  } catch {
    // Fall through to Tier 3
  }

  // Tier 3: Fuzzy field-by-field regex fallback extractor
  const fuzzyCard = extractCardFieldsFuzzy(raw);
  if (fuzzyCard && Object.keys(fuzzyCard).length > 0) {
    return { card: fuzzyCard, parseError: false };
  }

  return { card: null, parseError: true };
}

/** True when raw looks like an unfinished JSON object (common Venice truncation). */
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

type LlmModels = { oneprovider?: string; openrouter?: string };

const CARD_JSON_MAX_TOKENS = 4096;
/** Prompt Builder var gen: smaller completions than whole-card JSON (do not inherit CARD_JSON_MAX_TOKENS). */
const PROMPT_VAR_MAX_TOKENS = 512;
const PROMPT_ALL_VARS_MAX_TOKENS = 2048;
/** Deno/safety ceiling only — not a light-tool throttle. Full card + prompt instructions allowed. */
const RAW_CONTEXT_MAX_CHARS = 120_000;
/** Per-model fetch timeout so a hung gateway cannot burn the whole edge budget. */
const PROVIDER_TIMEOUT_MS = 40_000;

/**
 * Cascade: OneProvider first, then OpenRouter.
 * OneProvider's catalog is commercial (no dedicated uncensored SKUs) — Grok is the least-filtered option there.
 * OpenRouter carries Venice Uncensored plus other permissive RP models. Cascade is provider/model failure,
 * not content refusal. BYOK OpenRouter key (openrouterKeyOverride) is used when present and never stored.
 */
const ONEPROVIDER_CARD_MODEL = 'grok-4.7';
const OPENROUTER_CARD_MODEL = 'cognitivecomputations/dolphin-mistral-24b-venice-edition';
const ONEPROVIDER_FALLBACK_MODELS = [
  'grok-4.7',
  'glm-5.3-flash',
];
const OPENROUTER_FALLBACK_MODELS = [
  'cognitivecomputations/dolphin-mistral-24b-venice-edition',
  'sao10k/l3.3-euryale-70b',
  'gryphe/mythomax-l2-13b',
  'google/gemma-4-31b-it:free',
];
const ONEPROVIDER_PROMPT_MODEL = ONEPROVIDER_CARD_MODEL;
const OPENROUTER_PROMPT_MODEL = OPENROUTER_CARD_MODEL;

const ONEPROVIDER_CHAT_URL = 'https://api.oneprovider.dev/v1/chat/completions';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Per-request BYOK OpenRouter key override (never logged, never stored). */
function openrouterOverrideFrom(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const value = (body as Record<string, unknown>).openrouterKey;
  return typeof value === 'string' ? value.trim() : '';
}

/** OpenRouter attribution headers (recommended by OpenRouter for free-tier usage). */
const OPENROUTER_HEADERS: Record<string, string> = {
  'HTTP-Referer': 'https://www.companionhub.app',
  'X-Title': 'AI Companion Hub',
};

function uniqueModels(explicit: string | undefined, fallbacks: string[]): string[] {
  const list: string[] = [];
  const first = (explicit || '').trim();
  if (first) list.push(first);
  for (const model of fallbacks) {
    if (!list.includes(model)) list.push(model);
  }
  return list;
}

function oneproviderModelsFor(explicit?: string): string[] {
  return uniqueModels(explicit, ONEPROVIDER_FALLBACK_MODELS);
}

function openrouterModelsFor(explicit?: string): string[] {
  return uniqueModels(explicit, OPENROUTER_FALLBACK_MODELS);
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

type ProviderAttempt = {
  provider: 'oneprovider' | 'openrouter';
  model: string;
  apiKey: string;
  url: string;
  extraHeaders?: Record<string, string>;
};

function providerAttempts(models?: LlmModels, openrouterKeyOverride?: string): ProviderAttempt[] {
  const override = (openrouterKeyOverride || '').trim();
  const oneKey = Deno.env.get('ONEPROVIDER_API_KEY');
  const openrouterKey = override || Deno.env.get('OPENROUTER_API_KEY');
  const attempts: ProviderAttempt[] = [];

  if (oneKey && !override) {
    for (const model of oneproviderModelsFor(models?.oneprovider)) {
      attempts.push({
        provider: 'oneprovider',
        model,
        apiKey: oneKey,
        url: ONEPROVIDER_CHAT_URL,
      });
    }
  }

  if (openrouterKey) {
    for (const model of openrouterModelsFor(models?.openrouter)) {
      attempts.push({
        provider: 'openrouter',
        model,
        apiKey: openrouterKey,
        url: OPENROUTER_CHAT_URL,
        extraHeaders: OPENROUTER_HEADERS,
      });
    }
  }

  return attempts;
}

function trimRawContext(raw: unknown, max = RAW_CONTEXT_MAX_CHARS): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Provider cascade that only accepts parseable whole-card JSON.
 * Invalid/truncated JSON is a soft failure and falls through to the next model.
 * A per-request BYOK OpenRouter key (openrouterKeyOverride) is used when present and never stored.
 */
async function callLLMForWholeCard(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = CARD_JSON_MAX_TOKENS,
  temperature = 0.7,
  models?: LlmModels,
  openrouterKeyOverride?: string,
): Promise<{ content: string; provider: string; card: Record<string, unknown> }> {
  const attempts = providerAttempts(models, openrouterKeyOverride);
  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      const content = await callProvider(
        attempt.url,
        attempt.apiKey,
        attempt.model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        PROVIDER_TIMEOUT_MS,
        attempt.extraHeaders,
      );
      if (!content || !String(content).trim()) {
        throw new Error('returned empty (0 chars)');
      }
      const { card, parseError } = parseWholeCardJson(content);
      if (!parseError && card) {
        const flat = sanitizeWholeCardFields(normalizeWholeCardToHub(card));
        return { content, provider: attempt.provider, card: flat };
      }
      const why = looksLikeTruncatedCardJson(content) ? 'truncated/incomplete JSON' : 'invalid JSON';
      throw new Error(`${why} (${content?.length || 0} chars)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${attempt.provider} card failed (${attempt.model}):`, msg);
      failures.push(clarifyFailure(attempt.provider === 'oneprovider' ? 'OneProvider' : 'OpenRouter', msg));
    }
  }

  if (failures.length === 0) {
    throw new Error('No API keys configured (ONEPROVIDER_API_KEY or OPENROUTER_API_KEY).');
  }
  throw new Error(formatCascadeFailure('whole-card', failures));
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = CARD_JSON_MAX_TOKENS,
  temperature = 0.3,
  models?: LlmModels,
  openrouterKeyOverride?: string,
) {
  const attempts = providerAttempts(models, openrouterKeyOverride);
  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      const content = await callProvider(
        attempt.url,
        attempt.apiKey,
        attempt.model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        PROVIDER_TIMEOUT_MS,
        attempt.extraHeaders,
      );
      if (!content || !String(content).trim()) {
        throw new Error('returned empty (0 chars)');
      }
      return { content, provider: attempt.provider };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${attempt.provider} failed (${attempt.model}):`, msg);
      failures.push(clarifyFailure(attempt.provider === 'oneprovider' ? 'OneProvider' : 'OpenRouter', msg));
    }
  }

  if (failures.length === 0) {
    throw new Error('No API keys configured (ONEPROVIDER_API_KEY or OPENROUTER_API_KEY).');
  }
  throw new Error(formatCascadeFailure('generic', failures));
}

async function callProvider(
  url: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  timeoutMs?: number,
  extraHeaders?: Record<string, string>,
) {
  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
  };

  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
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
      signal: controller?.signal,
    });
  } catch (e) {
    if (controller?.signal.aborted) {
      throw new Error(`timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    const errorData = await response.text();
    console.error('LLM API error:', errorData);
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content || !String(content).trim()) {
    throw new Error('returned empty (0 chars)');
  }
  return content;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    // Optional per-request visitor key (BYOK). Never logged or persisted.
    const byokOverride = openrouterOverrideFrom(body);
    const byokModel = typeof body?.openrouterModel === 'string' ? body.openrouterModel.trim() : '';
    // Explicit model preference for this request (BYOK model wins over shared defaults).
    const byokModels = byokModel ? { openrouter: byokModel } : undefined;

    // === HEALTH CHECK ===
    if (action === 'health') {
      // Never report healthy unless at least one server provider key is configured.
      // A configured key is still not a guarantee it is valid, but reporting
      // healthy with no key would enable AI buttons that are guaranteed to fail.
      // Client-side BYOK (a visitor's own key) is handled separately by the UI.
      const hasProviderKey = Boolean(
        Deno.env.get('ONEPROVIDER_API_KEY') || Deno.env.get('OPENROUTER_API_KEY'),
      );
      const payload = hasProviderKey
        ? { ok: true }
        : { ok: false, reason: 'No server AI provider key is configured (ONEPROVIDER_API_KEY or OPENROUTER_API_KEY).' };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === FETCH URL (Doc Consolidator) ===
    if (action === 'fetch-url') {
      const { url } = body;
      if (!url || typeof url !== 'string') {
        return new Response(JSON.stringify({ error: 'url is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return new Response(JSON.stringify({ error: 'Only http/https URLs are supported' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const response = await fetch(parsedUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DocConsolidator/1.0; +https://nsfw-ai-directory.local)',
          'Accept': 'text/html,text/plain,application/xhtml+xml,*/*',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        return new Response(JSON.stringify({ error: `Failed to fetch URL (HTTP ${response.status})` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const contentType = response.headers.get('content-type') || '';
      const raw = await response.text();

      // Strip HTML to readable text (best effort) when the response is HTML
      let text = raw;
      if (contentType.includes('text/html') || raw.trimStart().startsWith('<!doctype') || raw.trimStart().startsWith('<html')) {
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
          .replace(/&#39;/gi, "'")
          .replace(/\s+/g, ' ')
          .trim();
      }

      const truncated = text.length > 32000;
      const finalText = truncated ? text.slice(0, 32000) : text;

      return new Response(JSON.stringify({ text: finalText, truncated, url: parsedUrl.toString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === DOC CONSOLIDATOR ===
    if (action === 'consolidate') {
      const { serviceName, text } = body;
      if (!serviceName || !text) {
        return new Response(JSON.stringify({ error: 'serviceName and text are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

      const { content: result, provider } = await callLLM('You are a technical documentation specialist. Consolidate raw documentation into clean, structured markdown.', prompt, undefined, undefined, byokModels, byokOverride);
      const trimmed = typeof result === 'string' ? result.trim() : '';
      if (!trimmed) {
        return new Response(JSON.stringify({ error: 'AI returned an empty result' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ result: trimmed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CHARACTER CARD: GENERATE SINGLE FIELD ===
    // Single-field generation is ALWAYS targeted plain text (fast ~2s, saves 90% tokens, eliminates JSON parse failures).
    // WITH refinementNotes + draft content: targeted plain-text DELTA refine.
    if (action === 'generate-field') {
      const { fieldName, existingFields, specVersion, refinementNotes, currentValue } = body;
      if (!fieldName) {
        return new Response(JSON.stringify({ error: 'fieldName is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const isV3 = specVersion === 'v3' || specVersion === 'V3';
      const fieldKey = String(fieldName);
      const notes = typeof refinementNotes === 'string' ? refinementNotes.trim() : '';
      const clientDraft = typeof currentValue === 'string' ? currentValue : '';
      const existingDraft = formatExistingFieldValue(existingFields?.[fieldKey]) || '';
      const draft = clientDraft.trim() || existingDraft;
      const useRefine = notes.length > 0 && draft.length > 0;

      if (useRefine) {
        // Single-field with notes: ALWAYS targeted plain-text path
        const prompt = buildRefinementFieldPrompt(fieldKey, draft, notes, existingFields, isV3);
        const maxTok = FIELD_MAX_TOKENS[fieldKey] ?? 512;
        const singleSystem = `${CHARACTER_CARD_STUDIO_SKILL_RULES}

You are an expert Character Card field editor for SillyTavern CCV2/V3.
Revise ONLY the requested field draft per the creator critique. Critique overrides conflicting draft; MUST actively modify; do not copy draft unchanged when notes conflict.
Write ONLY the revised field text. No JSON, no markdown fences, no commentary.
Follow Voice Anchor + POV + relational phrasing + macro rules in the user prompt.`;
        const { content: raw, provider } = await callLLM(singleSystem, prompt, maxTok, 0.7, byokModels, byokOverride);
        let fieldValue: unknown = typeof raw === 'string' ? raw.trim() : '';
        if (typeof fieldValue === 'string') {
          fieldValue = stripThinkingBlocks(fieldValue);
          const fence = fieldValue.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n?```$/);
          if (fence) fieldValue = fence[1].trim();
          fieldValue = sanitizeCardText(fieldValue, fieldKey);
        }
        return new Response(JSON.stringify({ result: fieldValue, fieldName: fieldKey, wholeCardBuilt: false, refined: true, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Targeted single-field generation
      const prompt = buildSingleFieldUserPrompt(fieldKey, existingFields, isV3);
      const maxTok = FIELD_MAX_TOKENS[fieldKey] ?? 512;
      const singleSystem = `${CHARACTER_CARD_STUDIO_SKILL_RULES}

You are an expert Character Card field author for SillyTavern CCV2/V3.
Write ONLY the requested field text. No JSON, no markdown fences, no commentary.
Follow Voice Anchor + POV + relational phrasing + macro rules in the user prompt.`;
      const { content: raw, provider } = await callLLM(singleSystem, prompt, maxTok, 0.7, byokModels, byokOverride);
      let fieldValue: unknown = typeof raw === 'string' ? raw.trim() : '';
      if (typeof fieldValue === 'string') {
        fieldValue = stripThinkingBlocks(fieldValue);
        const fence = fieldValue.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n?```$/);
        if (fence) fieldValue = fence[1].trim();
        fieldValue = sanitizeCardText(fieldValue, fieldKey);
      }
      return new Response(JSON.stringify({ result: fieldValue, fieldName: fieldKey, wholeCardBuilt: false, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CHARACTER CARD: GENERATE ALL FIELDS ===
    // Whole-card generation with multi-tier JSON repair & fuzzy fallback.
    // WITH refinementNotes: keep schema + POV/Voice Anchor; append REFINE-ALL MODE (critique + preservation).
    if (action === 'generate-all') {
      const { existingFields, specVersion, refinementNotes } = body;
      const isV3 = specVersion === 'v3' || specVersion === 'V3';
      const notes = typeof refinementNotes === 'string' ? refinementNotes.trim() : '';
      const useRefine = notes.length > 0;
      let prompt = buildWholeCardUserPrompt(existingFields, isV3);
      if (useRefine) {
        prompt += buildRefineAllAppendix(notes);
        prompt += `\n\nGENERATE-ALL REFINE MODE: Return the complete revised card JSON. Client will apply every field.`;
      } else {
        prompt += `\n\nGENERATE-ALL MODE: Return the complete card JSON. Client will apply every field.`;
      }

      const { content: result, provider, card } = await callLLMForWholeCard(CARD_AUTHOR_SYSTEM, prompt, CARD_JSON_MAX_TOKENS, 0.7, byokModels, byokOverride);

      const flatHubCard = sanitizeWholeCardFields(normalizeWholeCardToHub(card));
      return new Response(JSON.stringify({ result: flatHubCard, provider, ...(useRefine ? { refined: true } : {}) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CHARACTER CARD: CONVERT / IMPORT ===
    if (action === 'convert-character') {
      const { inputText, outputFormat } = body;
      if (!inputText) {
        return new Response(JSON.stringify({ error: 'inputText is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const prompt = `You are given character data in an unknown format. Parse ALL the information and convert it into a ${outputFormat || 'V2/V3 compatible'} character card format.

INPUT DATA:
${inputText}

INSTRUCTIONS:
1. Identify all character information regardless of format (Character.AI, Pygmalion, W++, SBF, plain text, JSON, YAML, CCv2, CCv3, or any other format)
2. Map every piece of information to the most appropriate field
3. If info doesn't map directly, place it in the most logical field (description or personality usually)
4. ALL input text must be accounted for — nothing should be discarded
5. Return ONLY valid JSON

OUTPUT FORMAT:
{
  "name": "",
  "description": "",
  "personality": "",
  "scenario": "",
  "first_mes": "",
  "mes_example": "",
  "creator_notes": "",
  "system_prompt": "",
  "post_history_instructions": "",
  "tags": "",
  "creator": "",
  "nickname": "",
  "source": "",
  "group_only_greetings": ""
}

Return ONLY the JSON object, no explanation.`;

      const { content: rawResult, provider } = await callLLM(
        'You are a character card format conversion expert. You can parse any character format and convert to V2/V3 spec. You NEVER discard information. Respond with valid JSON only.',
        prompt, 4096, 0.3, byokModels, byokOverride
      );

      const cleaned = stripThinkingBlocks(rawResult);
      const { card, parseError } = parseWholeCardJson(cleaned);
      if (parseError || !card) {
        return new Response(JSON.stringify({ result: rawResult, parseError: true, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ result: card, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PROMPT BUILDER: GENERATE VARIABLE ===
    if (action === 'generate-prompt-variable') {
      const { variableName, variableDescription, templateContext, existingVariables, rawContext } = body;
      if (!variableName) {
        return new Response(JSON.stringify({ error: 'variableName is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const cappedRaw = trimRawContext(rawContext);
      const contextParts: string[] = [];
      if (existingVariables) {
        for (const [key, value] of Object.entries(existingVariables)) {
          if (value && typeof value === 'string' && (value as string).trim()) {
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
        0.8,
        { oneprovider: ONEPROVIDER_PROMPT_MODEL, openrouter: byokModel || OPENROUTER_PROMPT_MODEL },
        byokOverride,
      );

      const cleaned = stripThinkingBlocks(result).trim();
      return new Response(JSON.stringify({ result: cleaned, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PROMPT BUILDER: GENERATE ALL VARIABLES ===
    if (action === 'generate-all-prompt-variables') {
      const { templateId, templateName, templateDescription, template, variables, existingVariables, rawContext } = body;
      if (!variables || !Array.isArray(variables)) {
        return new Response(JSON.stringify({ error: 'variables array is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const cappedRaw = trimRawContext(rawContext);
      const contextParts: string[] = [];
      if (existingVariables) {
        for (const [key, value] of Object.entries(existingVariables)) {
          if (value && typeof value === 'string' && (value as string).trim()) {
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

      const prompt = `Generate ALL variables for the "${templateName}" prompt template.
Template description: ${templateDescription}

Template:
${template}

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
        0.8,
        { oneprovider: ONEPROVIDER_PROMPT_MODEL, openrouter: byokModel || OPENROUTER_PROMPT_MODEL },
        byokOverride,
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

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const upstream = /LLM API error|timeout|All LLM providers failed|No API keys configured/i.test(message);
    const status = upstream ? 502 : 500;
    return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
