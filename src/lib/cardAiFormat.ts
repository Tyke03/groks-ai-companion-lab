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
    const known = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'system_prompt'];
    const hits = known.filter((k) => k in obj).length;
    if (hits >= 3 || fieldName in obj) {
      const extracted = extractCardField(obj, fieldName);
      if (extracted !== undefined) return { value: extracted, slicedFromWholeCard: true };
    }
  }
  return { value: result, slicedFromWholeCard: false };
}

