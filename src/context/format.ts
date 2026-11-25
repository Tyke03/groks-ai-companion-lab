const ITEM_RE = /<<ITEM\s+(\d+)>>/g;

/** Serializer always emits numbered item blocks. Never a newline join. */
export function serializeItems(items: string[]): string {
  return items.map((item, i) => `<<ITEM ${i + 1}>>\n${item}`).join("\n");
}

/**
 * Parser order: `<<ITEM n>>`, then `<START>`, then a blank-line split.
 * The blank-line fallback keeps each block as its own item.
 */
export function parseItems(text: string): string[] {
  const raw = String(text ?? "");
  if (/<<ITEM\s+\d+>>/.test(raw)) {
    const marks = [...raw.matchAll(ITEM_RE)];
    const items: string[] = [];
    for (let i = 0; i < marks.length; i++) {
      const start = (marks[i].index ?? 0) + marks[i][0].length;
      const end = i + 1 < marks.length ? (marks[i + 1].index ?? raw.length) : raw.length;
      let body = raw.slice(start, end);
      body = body.replace(/<<END_[\s\S]*$/, "");
      items.push(body.replace(/^\n/, "").replace(/\s+$/, ""));
    }
    return items;
  }
  if (raw.includes("<START>")) {
    return raw
      .split(/<START>/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  return raw
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function renderFieldBody(value: string | string[]): string {
  if (Array.isArray(value)) return serializeItems(value);
  return value;
}
