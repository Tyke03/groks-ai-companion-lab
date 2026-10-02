/**
 * Lossy V2 export helpers: detect V3-only content that a V2 export would drop.
 */

import type { CardData, PreservedData } from "./cardTypes";

export interface V3OnlyFieldPresence {
  key: string;
  label: string;
}

/** List V3-draft-only fields that currently have content. */
export function listV3OnlyFields(data: CardData, preserved: PreservedData): V3OnlyFieldPresence[] {
  const found: V3OnlyFieldPresence[] = [];
  if (data.nickname.trim()) found.push({ key: "nickname", label: "nickname" });
  if (data.source.some((s) => s.trim())) found.push({ key: "source", label: "source" });
  if (data.group_only_greetings.some((g) => g.trim())) {
    found.push({ key: "group_only_greetings", label: "group-only greetings" });
  }
  if (data.creator_notes_multilingual.trim()) {
    found.push({ key: "creator_notes_multilingual", label: "multilingual creator notes" });
  }
  if (preserved.assets.length > 0) found.push({ key: "assets", label: "assets" });
  if (preserved.preservedAssets.length > 0) {
    found.push({ key: "preservedAssets", label: "preserved (non-exportable) assets" });
  }
  if (preserved.creation_date !== undefined) {
    found.push({ key: "creation_date", label: "creation_date" });
  }
  if (preserved.modification_date !== undefined) {
    found.push({ key: "modification_date", label: "modification_date" });
  }
  return found;
}

export function hasV3OnlyContent(data: CardData, preserved: PreservedData): boolean {
  return listV3OnlyFields(data, preserved).length > 0;
}

/**
 * Accurate warning for a lossy V2 export / V3→V2 switch.
 * Returns null when nothing would be dropped.
 */
export function lossyV2Warning(data: CardData, preserved: PreservedData): string | null {
  const fields = listV3OnlyFields(data, preserved);
  if (fields.length === 0) return null;
  const names = fields.map((f) => f.label).join(", ");
  return (
    `Exporting or switching to V2 will omit V3 draft fields: ${names}. ` +
    `These values stay in the editor until you clear them, but they will not appear in the V2 JSON/PNG.`
  );
}

/** True when a V2 export path must ask for confirm before proceeding. */
export function requiresLossyV2Confirm(
  exportFormat: "v2" | "v3",
  data: CardData,
  preserved: PreservedData,
): boolean {
  return exportFormat === "v2" && hasV3OnlyContent(data, preserved);
}
