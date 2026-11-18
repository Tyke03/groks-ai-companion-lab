export const providerLabel = (p?: string) =>
  p === "venice" || p === "venice-byok"
    ? "Venice"
    : p === "openrouter" || p === "openrouter-byok"
      ? "OpenRouter"
      : p === "oneprovider" || p === "oneprovider-byok"
        ? "OneProvider"
        : "shared";

export const isByokProvider = (p?: string) => !!p && p.endsWith("-byok");
