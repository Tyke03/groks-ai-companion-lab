/**
 * Ordered-subsequence search utilities.
 *
 * These power the ⌘K command palette's platform suggestions. The matching
 * semantics are deliberately deterministic: we do NOT use cmdk's fuzzy scorer,
 * relevance ranking, or prefix/exact-match boosts, because the product
 * requirement is a stable A-Z ordering of matched platform names.
 */

/**
 * Normalize a string for matching: lowercase and strip every character that is
 * not alphanumeric, so punctuation and spacing never influence a match.
 */
export function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Ordered-subsequence match: every character of `query` must occur in
 * `candidate` in order, but characters do not need to be adjacent.
 *
 * - query "ai" matches "TavernAI", "RisuAI", "Agnaistic".
 * - query "ai" does NOT match "SillyTavern" (its only "a" follows its "i").
 *
 * An empty query matches everything (caller decides how to display it).
 */
export function isOrderedSubsequence(query: string, candidate: string): boolean {
  const q = normalizeForSearch(query);
  if (q.length === 0) return true;

  const c = normalizeForSearch(candidate);
  let ci = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const target = q.charCodeAt(qi);
    let matched = false;
    while (ci < c.length) {
      if (c.charCodeAt(ci) === target) {
        ci++;
        matched = true;
        break;
      }
      ci++;
    }
    if (!matched) return false;
  }
  return true;
}
