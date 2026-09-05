/** Case-insensitive substring match on platform name (A–Z sort is caller's job). */
export function filterPlatformsByName<T extends { name: string }>(
  platforms: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return platforms;
  return platforms.filter((p) => p.name.toLowerCase().includes(q));
}
