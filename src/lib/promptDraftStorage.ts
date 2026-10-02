/**
 * Prompt Builder draft persistence — localStorage only.
 * Restores template selection, author fields, rendered-output inputs, and raw context
 * (including Doc Consolidator bridge notes) across reload.
 */

export const PROMPT_DRAFT_KEY = "ai-companion-hub-prompt-draft";

export interface PromptDraft {
  version: 1;
  selectedTemplateId: string;
  variables: Record<string, string>;
  rawContext: string;
  showRawContext: boolean;
  updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeVariables(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function createEmptyPromptDraft(
  overrides: Partial<PromptDraft> = {},
): PromptDraft {
  return {
    version: 1,
    selectedTemplateId: overrides.selectedTemplateId ?? "",
    variables: overrides.variables ?? {},
    rawContext: overrides.rawContext ?? "",
    showRawContext: overrides.showRawContext ?? false,
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

export function loadPromptDraft(): PromptDraft | null {
  try {
    const raw = localStorage.getItem(PROMPT_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.version !== 1) return null;
    if (typeof parsed.selectedTemplateId !== "string") return null;
    return {
      version: 1,
      selectedTemplateId: parsed.selectedTemplateId,
      variables: sanitizeVariables(parsed.variables),
      rawContext: typeof parsed.rawContext === "string" ? parsed.rawContext : "",
      showRawContext: Boolean(parsed.showRawContext),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function savePromptDraft(draft: Omit<PromptDraft, "version" | "updatedAt"> & { updatedAt?: number }): PromptDraft {
  const full: PromptDraft = {
    version: 1,
    selectedTemplateId: draft.selectedTemplateId,
    variables: sanitizeVariables(draft.variables),
    rawContext: draft.rawContext,
    showRawContext: Boolean(draft.showRawContext),
    updatedAt: draft.updatedAt ?? Date.now(),
  };
  try {
    localStorage.setItem(PROMPT_DRAFT_KEY, JSON.stringify(full));
  } catch {
    // Quota / private mode — ignore; UI still works for the session.
  }
  return full;
}

export function clearPromptDraft(): void {
  try {
    localStorage.removeItem(PROMPT_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}