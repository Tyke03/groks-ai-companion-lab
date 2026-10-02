/**
 * Character Card AI field formatting helpers (client-side).
 * Keeps SillyTavern-style mes_example newlines intact after generation.
 */

/** Prompt fragment describing required mes_example format (also mirrored in venice-ai). */
export const MES_EXAMPLE_FORMAT_RULES = `Format mes_example EXACTLY like SillyTavern example dialogue:

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

/**
 * Normalize AI text so multiline fields (especially mes_example) are not collapsed.
 * Converts literal \n / \r\n sequences, strips wrapping fences/quotes.
 */
export function normalizeAiMultiline(raw: string): string {
  let text = String(raw ?? '');
  text = text.replace(/^\uFEFF/, '').trim();

  // Strip surrounding markdown fences
  const fence = text.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n?```$/);
  if (fence) text = fence[1].trim();

  // Unwrap a single pair of surrounding quotes if the whole payload is quoted
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2)
  ) {
    const inner = text.slice(1, -1);
    // Only unwrap when it looks like an escaped blob, not natural dialogue
    if (inner.includes('\\n') || /^\s*<START>/.test(inner)) {
      text = inner;
    }
  }

  // If the model returned literal backslash-n instead of real newlines, expand them.
  const hasRealNewlines = text.includes('\n');
  const hasEscaped = /\\n/.test(text);
  const escapedCount = (text.match(/\\n/g) || []).length;
  const realCount = (text.match(/\n/g) || []).length;
  if (hasEscaped && (!hasRealNewlines || escapedCount > realCount)) {
    text = text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }

  // Soft-fix one-line <START> dumps: put <START> on its own line when jammed.
  text = text.replace(/\s*<START>\s*/g, (_m, offset) => (offset === 0 ? '<START>\n' : '\n\n<START>\n'));
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

/**
 * Parse AI list values for alternate/group greetings without comma-splitting prose.
 */
export function parseAiStringList(value: unknown, opts?: { max?: number }): string[] {
  const max = opts?.max;
  let items: string[] = [];

  if (Array.isArray(value)) {
    items = value.map((v) => normalizeAiMultiline(String(v))).filter(Boolean);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    // Try JSON array first
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          items = parsed.map((v) => normalizeAiMultiline(String(v))).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }
    if (items.length === 0) {
      // Split on blank lines or single newlines, never on commas (greetings contain commas).
      items = trimmed
        .split(/\n\s*\n|\n/)
        .map((s) => normalizeAiMultiline(s))
        .filter(Boolean);
    }
  }

  if (typeof max === 'number' && max > 0) items = items.slice(0, max);
  return items;
}

/** Count <START> blocks in mes_example text. */
export function countMesExampleStarts(text: string): number {
  const matches = normalizeAiMultiline(text).match(/^<START>\s*$/gm);
  return matches ? matches.length : 0;
}


/** Strip thinking and reasoning blocks emitted by thinking/reasoning models. */
export function stripThinkingBlocks(text: string): string {
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
export function repairJsonString(input: string): string {
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
export function extractCardFieldsFuzzy(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  const text = stripThinkingBlocks(raw);
  const result: Record<string, unknown> = {};

  for (const field of HUB_CARD_FIELD_ORDER) {
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

/** Parse a whole-card JSON object from an AI response with multi-tier repair and fallback. */
export function parseWholeCardJson(raw: string): { card: Record<string, unknown> | null; parseError: boolean } {
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

/** Pull one field from a whole-card object (supports optional nested data). */
export function extractCardField(card: Record<string, unknown>, fieldName: string): unknown {
  if (!card || typeof card !== 'object') return undefined;
  if (fieldName in card) return card[fieldName];
  const data = card.data;
  if (data && typeof data === 'object' && !Array.isArray(data) && fieldName in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)[fieldName];
  }
  return undefined;
}


/** Hub whole-card field order (mirrors venice-ai CARD_FIELD_ORDER). */
export const HUB_CARD_FIELD_ORDER = [
  'name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example',
  'alternate_greetings', 'group_only_greetings', 'creator_notes', 'tags', 'nickname',
  'source', 'creator', 'character_version', 'post_history_instructions', 'system_prompt',
] as const;

const ARRAY_CARD_FIELDS = new Set([
  'alternate_greetings',
  'group_only_greetings',
  'source',
]);

function joinStringOrArray(value: unknown, sep = ', '): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? '').trim()).filter(Boolean).join(sep);
  }
  if (value == null) return '';
  return String(value);
}

/**
 * Fix common macro / POV mistakes from LLM card text.
 * Lowercases {{User}}/{{Char}}, fixes possessives, rewrites User: lines,
 * and (for description/personality) turns leading "You are" into "{{char}} is".
 */
export function sanitizeCardMacros(text: string, fieldName?: string): string {
  if (!text) return text;
  let out = text;

  // Case macros: {{User}} / {{Char}} / mixed → lowercase
  out = out.replace(/\{\{\s*User\s*\}\}/g, '{{user}}');
  out = out.replace(/\{\{\s*Char\s*\}\}/g, '{{char}}');
  out = out.replace(/\{\{\s*USER\s*\}\}/g, '{{user}}');
  out = out.replace(/\{\{\s*CHAR\s*\}\}/g, '{{char}}');

  // Possessives: {{User's}} / {{user's}} / {{Char's}} → {{user}}'s / {{char}}'s
  out = out.replace(/\{\{\s*User'?s\s*\}\}/gi, "{{user}}'s");
  out = out.replace(/\{\{\s*user'?s\s*\}\}/g, "{{user}}'s");
  out = out.replace(/\{\{\s*Char'?s\s*\}\}/gi, "{{char}}'s");
  out = out.replace(/\{\{\s*char'?s\s*\}\}/g, "{{char}}'s");

  // Ban "The User" as a noun phrase
  out = out.replace(/\bThe User\b/g, '{{user}}');
  out = out.replace(/\bthe User\b/g, '{{user}}');
  // Case-insensitive: possessives BEFORE bare "the user"
  out = out.replace(/\bthe user's\b/gi, "{{user}}'s");
  out = out.replace(/\bthe user\b/gi, '{{user}}');

  // Speaker labels at line start
  out = out.replace(/(^|\n)\s*User\s*:/g, '$1{{user}}:');
  out = out.replace(/(^|\n)\s*Name\s*:/g, '$1{{char}}:');

  // description/personality only: leading "You are" → "{{char}} is"
  if (fieldName === 'description' || fieldName === 'personality') {
    out = out.replace(/^(\s*)You are\b/i, '$1{{char}} is');
  }

  return out;
}

/** Sanitize a single field value (string or list of strings). */
export function sanitizeFieldText(value: unknown, fieldName?: string): unknown {
  if (typeof value === 'string') return sanitizeCardMacros(value, fieldName);
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? sanitizeCardMacros(v, fieldName) : v));
  }
  return value;
}

/** Rewrite User:/Name: speaker labels to {{user}}:/{{char}}: */
export function rewriteSpeakerLabels(text: string, charName: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/(^|\n)\s*User\s*:/g, '$1{{user}}:');
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

/**
 * Normalize foreign / nested whole-card JSON into flat Hub CardData keys only.
 * Unwraps character_card; prefers nested .data; joins personality/tags arrays to strings;
 * skips lore (no character_book invent); rewrites speaker labels; sanitizes macros.
 */
export function normalizeWholeCardToHub(
  card: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return {};

  let root: Record<string, unknown> = { ...card };

  const wrapped = root.character_card;
  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
    root = { ...(wrapped as Record<string, unknown>) };
  }

  const dataObj = root.data;
  const dataRec =
    dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)
      ? (dataObj as Record<string, unknown>)
      : null;
  const dataLooksLikeCard = !!(
    dataRec &&
    (typeof dataRec.name === 'string' ||
      typeof dataRec.description === 'string' ||
      typeof dataRec.personality === 'string' ||
      typeof dataRec.first_mes === 'string')
  );

  const merged: Record<string, unknown> = { ...root };
  if (dataLooksLikeCard && dataRec) {
    for (const key of HUB_CARD_FIELD_ORDER) {
      if (key in dataRec && dataRec[key] !== undefined && dataRec[key] !== null) {
        merged[key] = dataRec[key];
      }
    }
  }

  // lore is not a Hub flat field — skip
  if (Array.isArray(merged.personality)) {
    merged.personality = joinStringOrArray(merged.personality, ', ');
  }
  if (Array.isArray(merged.tags)) {
    merged.tags = joinStringOrArray(merged.tags, ', ');
  }

  const charName = joinStringOrArray(merged.name).trim();
  const result: Record<string, unknown> = {};

  for (const key of HUB_CARD_FIELD_ORDER) {
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

    if (key === 'mes_example' || key === 'first_mes') {
      value = rewriteSpeakerLabels(String(value ?? ''), charName);
    } else if (key === 'alternate_greetings' && Array.isArray(value)) {
      value = value.map((v) => rewriteSpeakerLabels(String(v ?? ''), charName));
    }

    // Sanitize macros on all string fields + alternate_greetings items
    value = sanitizeFieldText(value, key);

    result[key] = value;
  }

  return result;
}

/**
 * Apply AI generate-field result: ONLY the requested field changes.
 * If the API mistakenly returns a whole card object, slice to fieldName.
 */
export function applyGenerateFieldResult(
  fieldName: string,
  result: unknown,
): { value: unknown; slicedFromWholeCard: boolean } {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;
    // Detect whole-card / foreign envelope on the RAW object (normalize fills every key).
    const probe = (typeof obj.character_card === 'object' && obj.character_card && !Array.isArray(obj.character_card))
      ? (obj.character_card as Record<string, unknown>)
      : obj;
    const known = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'system_prompt'];
    const hits = known.filter((k) => {
      if (k in probe) return true;
      const d = probe.data;
      return !!(d && typeof d === 'object' && !Array.isArray(d) && k in (d as Record<string, unknown>));
    }).length;
    if (
      hits >= 3 ||
      fieldName in probe ||
      (probe.data && typeof probe.data === 'object' && !Array.isArray(probe.data) && fieldName in (probe.data as Record<string, unknown>))
    ) {
      const flat = normalizeWholeCardToHub(obj);
      const extracted = extractCardField(flat, fieldName);
      if (extracted !== undefined) return { value: extracted, slicedFromWholeCard: true };
    }
  }
  // Plain string / list path — still sanitize
  return { value: sanitizeFieldText(result, fieldName), slicedFromWholeCard: false };
}
