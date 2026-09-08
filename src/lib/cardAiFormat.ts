/**
 * Character Card AI field formatting helpers (client-side).
 * Keeps SillyTavern-style mes_example newlines intact after generation.
 */

/** Prompt fragment describing required mes_example format (also mirrored in venice-ai). */
export const MES_EXAMPLE_FORMAT_RULES = `Format mes_example EXACTLY like SillyTavern example dialogue:

- Produce exactly THREE separate example blocks.
- Each block starts with <START> alone on its own line.
- Immediately after <START>, use {{user}}: and {{char}}: speaker labels (never User:, never the character's real name as a label, never Name:).
- Do NOT wrap entire lines in quotes.
- Put actions and inner thoughts in single asterisks, SillyTavern-style: *giggles* *she leans in close*
- Do NOT mash actions with semicolons or put the whole exchange on one line.
- Steer tone/length from the character's name, personality, scenario, first message, and description.
- Prefer richer, longer examples that model high chat quality — UNLESS personality/description clearly indicates quiet/silent/not-a-talker (then shorter replies are OK).

Good shape:
<START>
{{user}}: Hey Riley, I'm so excited to be working with you.
{{char}}: *giggles* I'm excited to have you on board, too! I think we're going to make some magic happen. *she leans in close* But first, let's get one thing straight - I'm the boss, and you're going to have to do what I say. *she winks*

<START>
{{user}}: ...
{{char}}: ...
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


/** Parse a whole-card JSON object from an AI response (fences / prose tolerated). */
export function parseWholeCardJson(raw: string): { card: Record<string, unknown> | null; parseError: boolean } {
  if (!raw || typeof raw !== 'string') return { card: null, parseError: true };
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { card: null, parseError: true };
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { card: null, parseError: true };
    return { card: parsed as Record<string, unknown>, parseError: false };
  } catch {
    return { card: null, parseError: true };
  }
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
 * skips lore (no character_book invent); rewrites speaker labels.
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
  return { value: result, slicedFromWholeCard: false };
}

