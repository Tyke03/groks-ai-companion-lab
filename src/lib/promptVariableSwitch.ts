/**
 * Prompt Builder template-switch helpers.
 * Preserve overlapping keys; surface unique filled keys that would be discarded.
 */

export function filledUniqueKeys(
  variables: Record<string, string>,
  nextTemplateVarNames: string[],
): string[] {
  const next = new Set(nextTemplateVarNames);
  return Object.entries(variables)
    .filter(([key, value]) => Boolean(value?.trim()) && !next.has(key))
    .map(([key]) => key)
    .sort();
}

/** Keep values whose keys exist on the next template (overlapping). */
export function preserveOverlappingVariables(
  variables: Record<string, string>,
  nextTemplateVarNames: string[],
): Record<string, string> {
  const next = new Set(nextTemplateVarNames);
  const preserved: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (next.has(key)) preserved[key] = value;
  }
  return preserved;
}
