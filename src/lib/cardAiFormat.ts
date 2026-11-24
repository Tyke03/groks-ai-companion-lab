/**
 * Character Card AI field formatting helpers (client-side).
 * Keeps SillyTavern-style mes_example newlines intact after generation.
 */

import type { CardData } from './cardTypes';

/** Prompt fragment describing required mes_example format (also mirrored in venice-ai). */
export const MES_EXAMPLE_FORMAT_RULES = `Format mes_example EXACTLY like SillyTavern example dialogue:

- Produce exactly THREE separate example blocks — NOT three hellos / greetings.
- Each block starts with <START> alone on its own line.
- Immediately after <START>, use {{user}}: and {{char}}: speaker labels (never User:, never the character's real name as a label, never Name:).
- Macros MUST be lowercase {{user}} / {{char}} only. Ban {{User}}, {{Char}}, {{User's}}; use {{user}}'s. Ban "The User". Ban User:/Name: labels.
- Use UNIFORM novel-style formatting matching first_mes and greetings: "double quotes" for spoken dialogue and *single asterisks* for actions and inner thoughts. Never wrap an entire turn (including actions) inside one outer pair of quotes.
- Never narrate {{user}}'s actions or dialogue inside {{char}}: lines.
- Do NOT mash actions with semicolons or put the whole exchange on one line.
- Steer tone/length from the character's name, personality, scenario, first message, and description.
- Prefer richer, longer examples that model high chat quality — UNLESS personality/description clearly indicates quiet/silent/not-a-talker (then shorter replies are OK).

THREE-BLOCK PROGRESSION (required range — not three casual hellos):
- Block1 Public/Casual mask: surface social mode; witty/polite/performative as fits {{char}}.
- Block2 Private/Core dynamic: the relationship tension or power dynamic between {{char}} and {{user}} shows.
- Block3 High stakes/Vulnerability: pressure, intimacy, risk, or emotional exposure — still in-character.

Good shape:
<START>
{{user}}: "Hey — ready to start?"
{{char}}: *smiles* "Absolutely." *leans in* "Follow my lead and we'll make magic."

<START>
{{user}}: "That was… intense. Are we okay?"
{{char}}: *softens* "With you? Always." *quieter* "Don't make me say it twice."

<START>
{{user}}: "If this goes wrong—"
{{char}}: *voice tight* "Then we face it." *reaches toward {{user}}* "I'm not letting go."
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
 * Checks explicit delimiters (=== GREETING N ===, <START>) BEFORE blank lines so
 * multi-paragraph greetings are never chopped in half.
 */
export function parseAiStringList(value: unknown, opts?: { max?: number }): string[] {
  const max = opts?.max;
  let items: string[] = [];

  if (Array.isArray(value)) {
    items = value.map((v) => normalizeAiMultiline(String(v))).filter(Boolean);
  } else if (typeof value === 'string') {
    let trimmed = value.replace(/^\uFEFF/, '').trim();
    if (!trimmed) return [];
    const fence = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n?```$/);
    if (fence) trimmed = fence[1].trim();
    if (!trimmed.includes('\n') && /\\n/.test(trimmed)) {
      trimmed = trimmed.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    }

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
      if (/^\s*===\s*GREETING\b[^=\n]*===\s*$/im.test(trimmed)) {
        items = trimmed
          .split(/^\s*===\s*GREETING\b[^=\n]*===\s*$/im)
          .map((s) => normalizeAiMultiline(s))
          .filter(Boolean);
      } else if (/(?:^|\n)\s*<START>\s*(?:\n|$)/i.test(trimmed) || /^\s*<START>/i.test(trimmed)) {
        items = trimmed
          .split(/^\s*<START>\s*$/im)
          .map((s) => normalizeAiMultiline(s))
          .filter(Boolean);
      } else {
        const byBlankLine = trimmed
          .split(/\n\s*\n/)
          .map((s) => normalizeAiMultiline(s))
          .filter(Boolean);
        items = byBlankLine.length > 1 ? byBlankLine : [normalizeAiMultiline(trimmed)];
      }
    }
  }

  if (typeof max === 'number' && max > 0) items = items.slice(0, max);
  return items;
}

/** Serialize string[] greetings using explicit <START> delimiters to preserve multi-paragraph structure. */
export function serializeAiStringList(value: unknown): string {
  if (!Array.isArray(value)) return typeof value === 'string' ? value.trim() : '';
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .map((item) => `<START>\n${item}`)
    .join('\n\n');
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
export function looksLikeTruncatedCardJson(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return true;
  const info = inspectJsonObjectBounds(raw);
  if (info.hasOpeningFenceUnclosed) return true;
  if (info.firstBrace === -1) return true;
  if (info.inString || info.openDepth > 0) return true;
  return info.rootCloseIndex === -1;
}

/** Parse a whole-card JSON object from an AI response with multi-tier repair and fallback. */
export function parseWholeCardJson(
  raw: string,
  opts?: { rejectTruncated?: boolean },
): { card: Record<string, unknown> | null; parseError: boolean } {
  if (!raw || typeof raw !== 'string') return { card: null, parseError: true };

  if (opts?.rejectTruncated && looksLikeTruncatedCardJson(raw)) {
    return { card: null, parseError: true };
  }

  // Step 1: Strip thinking blocks
  let text = stripThinkingBlocks(raw.trim());

  // Step 2: Strip code fences if present
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  else if (/^```(?:json)?\s*/i.test(text)) text = text.replace(/^```(?:json)?\s*/i, '').trim();

  // Step 3: Find outermost object bounds (string-aware so {{char}} macros inside strings never truncate slice)
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
 * Wrap plain unquoted spoken dialogue on {{user}}: lines in mes_example with double quotes
 * so both {{user}}: and {{char}}: match uniform novel-style formatting.
 */
export function quoteUnquotedUserLines(text: string): string {
  if (!text) return text;
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*\{\{user\}\}\s*:\s*)(.+)$/);
      if (!m) return line;
      const prefix = m[1];
      const body = m[2].trim();
      if (!body || body.includes('"') || body.includes('*')) return line;
      return `${prefix}"${body}"`;
    })
    .join('\n');
}

/**
 * Normalize comma-separated tags into one uniform lowercase space-separated style,
 * deduplicated and capped at 12 tags.
 */
export function normalizeCardTags(raw: string): string {
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

/**
 * Ensure AI-generated system_prompt or post_history_instructions opens with {{original}}
 * so importing into SillyTavern preserves the user's preset instead of overwriting it.
 */
export function ensureOriginalMacro(text: string): string {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return '';
  if (/\{\{\s*original\s*\}\}/i.test(trimmed)) {
    return trimmed.replace(/\{\{\s*original\s*\}\}/gi, '{{original}}');
  }
  return `{{original}}\n${trimmed}`;
}

/**
 * Replace hardcoded character name mentions with {{char}} in meta prompt fields
 * (system_prompt / post_history_instructions).
 */
export function replaceLiteralCharName(text: string, charName: string): string {
  if (!text) return text;
  const name = (charName || '').trim();
  if (name.length < 2) return text;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = text.replace(new RegExp(`\\b${esc}(['’]s)\\b`, 'gi'), "{{char}}'s");
  out = out.replace(new RegExp(`\\b${esc}\\b`, 'gi'), '{{char}}');
  return out;
}

/**
 * Balance unclosed single-asterisk action spans (`*...*`) and double-quoted dialogue
 * spans (`"..."`) per paragraph so an edit or repair pass never leaves broken italics
 * or quotes that bleed across an entire greeting or example block.
 */
export function balanceParagraphDelimiters(text: string, fieldName?: string): string {
  if (!text) return text;
  const rpFields = new Set(['first_mes', 'mes_example', 'alternate_greetings', 'group_only_greetings']);
  if (fieldName && !rpFields.has(fieldName)) return text;
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '<START>' || /^\s*[-*]\s+/.test(line)) return line;
      let out = line;
      // Count single asterisks (excluding ** bold pairs)
      const withoutBold = out.replace(/\*\*/g, '');
      const starCount = (withoutBold.match(/\*/g) || []).length;
      if (starCount % 2 === 1) {
        const quoteIdx = out.indexOf('"');
        const firstStarIdx = out.indexOf('*');
        if (quoteIdx > firstStarIdx && firstStarIdx !== -1 && (out.slice(0, quoteIdx).match(/\*/g) || []).length % 2 === 1) {
          const beforeQuote = out.slice(0, quoteIdx).trimEnd();
          const rest = out.slice(quoteIdx);
          out = `${beforeQuote}* ${rest}`;
        } else {
          out = `${out.trimEnd()}*`;
        }
      }
      // Count straight double quotes
      const quoteCount = (out.match(/"/g) || []).length;
      if (quoteCount % 2 === 1) {
        out = `${out.trimEnd()}"`;
      }
      return out;
    })
    .join('\n');
}

/**
 * Remove unexpanded {{user}}/{{char}} macros and internal generator jargon ("Content level 5")
 * from creator_notes (frontends render creator_notes literally for humans without macro substitution).
 */
export function sanitizeCreatorNotes(text: string, charName = ''): string {
  if (!text) return text;
  const name = charName.trim() || 'the character';
  let out = text;
  out = out.replace(/\{\{\s*user['’]?s\s*\}\}/gi, "the user's");
  out = out.replace(/\{\{\s*user\s*\}\}['’]s/gi, "the user's");
  out = out.replace(/\{\{\s*user\s*\}\}/gi, 'the user');
  out = out.replace(/\{\{\s*char['’]?s\s*\}\}/gi, `${name}'s`);
  out = out.replace(/\{\{\s*char\s*\}\}['’]s/gi, `${name}'s`);
  out = out.replace(/\{\{\s*char\s*\}\}/gi, name);
  out = out.replace(/\bcontent\s+level\s+[1-5]\s*(?:\([^)]*\))?\s*(?:is\s+)?(?:permitted|enabled|allowed|active)?/gi, 'Uncensored/mature themes');
  return out;
}

/**
 * Strip redundant paragraph-opening sub-headers (e.g. `**Identity:** `, `### Appearance`,
 * `**Core:** `, `- *Polished:* `) from description, personality, and scenario so
 * paragraphs stand cleanly separated by blank lines without wasting characters on
 * labels inside fields that SillyTavern already wraps in its own section headers.
 */
export function stripFieldSubheaders(text: string, fieldName?: string): string {
  if (!text) return text;
  if (fieldName !== 'description' && fieldName !== 'personality' && fieldName !== 'scenario') {
    return text;
  }
  const headerWord =
    '(?:Identity|Appearance|Physical(?:\\s+Appearance)?|Background|Backstory|History|Core(?:\\s+Traits|\\s+Mechanic[^:\\n]*)?|Traits|Psychology|Temperament|Speech(?:\\s*[/&]\\s*Mannerisms)?|Mannerisms|Voice|Mood(?:\\s+Triggers|\\s+Shifts)?|Triggers|Boundaries|Limits|Hard\\s+Limits|Setting|Relationship(?:\\s+Framing)?|Current\\s+Situation|Situation|Stakes|Premise|Overview|Win\\s+Condition|Progression|Rules)';
  let out = text;
  // Strip standalone markdown heading lines (`# Identity`, `## Appearance:`, `**Background:**` on its own line)
  out = out.replace(
    new RegExp(`(^|\\n)[ \\t]*(?:#{1,4}[ \\t]*${headerWord}[ \\t]*:?|\\*\\*[ \\t]*${headerWord}[ \\t]*:?[ \\t]*\\*\\*[ \\t]*:?)[ \\t]*\\n+`, 'gi'),
    '$1',
  );
  // Strip inline paragraph-leading bold/markdown/plain labels (`**Identity:** `, `**Speech/mannerisms:** `, `#Appearance: `)
  out = out.replace(
    new RegExp(`(^|\\n\\s*)(?:\\*\\*\\s*${headerWord}\\s*:?\\s*\\*\\*\\s*:?\\s*|#{1,4}\\s*${headerWord}\\s*:?\\s+|${headerWord}\\s*:\\s+)`, 'gi'),
    '$1',
  );
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Fix common macro / POV mistakes from LLM card text.
 * Lowercases {{User}}/{{Char}}, fixes possessives, rewrites User: lines,
 * strips redundant sub-headers on description/personality/scenario,
 * and (for description/personality) turns leading "You are" into "{{char}} is".
 */
export function sanitizeCardMacros(text: string, fieldName?: string, charName = ''): string {
  if (!text) return text;
  if (fieldName === 'creator_notes') {
    return sanitizeCreatorNotes(text, charName);
  }
  let out = text;

  // Case macros: {{User}} / {{Char}} / mixed case → lowercase
  out = out.replace(/\{\{\s*user\s*\}\}/gi, '{{user}}');
  out = out.replace(/\{\{\s*char\s*\}\}/gi, '{{char}}');
  out = out.replace(/\{\{\s*original\s*\}\}/gi, '{{original}}');

  // Possessives (straight or curly apostrophe): {{User's}} / {{user's}} / {{Char's}} → {{user}}'s / {{char}}'s
  out = out.replace(/\{\{\s*user['’]?s\s*\}\}/gi, "{{user}}'s");
  out = out.replace(/\{\{\s*char['’]?s\s*\}\}/gi, "{{char}}'s");

  // Ban "The User" / "the user" as a noun phrase (possessives BEFORE bare "the user")
  out = out.replace(/\bthe user['’]s\b/gi, "{{user}}'s");
  out = out.replace(/\bthe user\b/gi, '{{user}}');

  // Speaker labels at line start
  out = out.replace(/(^|\n)\s*User\s*:/gi, '$1{{user}}:');
  out = out.replace(/(^|\n)\s*Name\s*:/gi, '$1{{char}}:');

  // description/personality/scenario: strip redundant sub-headers before leading-POV check
  if (fieldName === 'description' || fieldName === 'personality' || fieldName === 'scenario') {
    out = stripFieldSubheaders(out, fieldName);
  }

  // description/personality only: leading "You are" → "{{char}} is"
  if (fieldName === 'description' || fieldName === 'personality') {
    out = out.replace(/^(\s*)You are\b/i, '$1{{char}} is');
  }

  // RP / greeting fields: deterministically balance unclosed * or " per paragraph
  if (
    fieldName === 'first_mes' ||
    fieldName === 'mes_example' ||
    fieldName === 'alternate_greetings' ||
    fieldName === 'group_only_greetings'
  ) {
    out = balanceParagraphDelimiters(out, fieldName);
  }

  return out;
}

/** Sanitize a single field value (string or list of strings). */
export function sanitizeFieldText(value: unknown, fieldName?: string, charName = ''): unknown {
  if (typeof value === 'string') return sanitizeCardMacros(value, fieldName, charName);
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? sanitizeCardMacros(v, fieldName, charName) : v));
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
        value = parseAiStringList(value, { max: key === 'source' ? undefined : 3 });
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
    } else if ((key === 'alternate_greetings' || key === 'group_only_greetings') && Array.isArray(value)) {
      value = value.map((v) => rewriteSpeakerLabels(String(v ?? ''), charName));
    }

    // Sanitize macros on all string fields + alternate_greetings items
    value = sanitizeFieldText(value, key, charName);
    if (key === 'tags' && typeof value === 'string') {
      value = normalizeCardTags(value);
    } else if (key === 'mes_example' && typeof value === 'string') {
      value = quoteUnquotedUserLines(value);
    } else if ((key === 'system_prompt' || key === 'post_history_instructions') && typeof value === 'string' && value.trim()) {
      value = ensureOriginalMacro(replaceLiteralCharName(value, charName));
    }

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

/**
 * Sanitize an entire CardData object (request context or export path, R7 / D6).
 * Preserves multilingual JSON and character_version; fixes macros, speaker labels,
 * and leading "You are" POV in description/personality.
 */
export function sanitizeCardData(card: CardData): CardData {
  const charName = String(card.name ?? '').trim();
  const cleanText = (val: string, fieldName: string) =>
    sanitizeCardMacros(String(val ?? ''), fieldName, charName);
  return {
    ...card,
    name: cleanText(card.name, 'name'),
    description: cleanText(card.description, 'description'),
    personality: cleanText(card.personality, 'personality'),
    scenario: cleanText(card.scenario, 'scenario'),
    first_mes: cleanText(rewriteSpeakerLabels(card.first_mes, charName), 'first_mes'),
    mes_example: cleanText(rewriteSpeakerLabels(card.mes_example, charName), 'mes_example'),
    creator_notes: cleanText(card.creator_notes, 'creator_notes'),
    system_prompt: cleanText(card.system_prompt, 'system_prompt'),
    post_history_instructions: cleanText(card.post_history_instructions, 'post_history_instructions'),
    tags: cleanText(card.tags, 'tags'),
    creator: cleanText(card.creator, 'creator'),
    nickname: cleanText(card.nickname, 'nickname'),
    creator_notes_multilingual: card.creator_notes_multilingual,
    character_version: card.character_version,
    source: Array.isArray(card.source) ? card.source.map((s) => cleanText(s, 'source')) : [],
    group_only_greetings: Array.isArray(card.group_only_greetings)
      ? card.group_only_greetings.map((s) => cleanText(rewriteSpeakerLabels(s, charName), 'group_only_greetings'))
      : [],
    alternate_greetings: Array.isArray(card.alternate_greetings)
      ? card.alternate_greetings.map((s) => cleanText(rewriteSpeakerLabels(s, charName), 'alternate_greetings'))
      : [],
  };
}
