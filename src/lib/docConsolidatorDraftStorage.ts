/**
 * Doc Consolidator draft persistence — auto-retain across reload.
 * Manual "Save Locally" (`doc_${service}`) remains an explicit named checkpoint.
 */

export const DOC_CONSOLIDATOR_DRAFT_KEY = "ai-companion-hub-doc-consolidator-draft";

export type DocResultMode = "offline" | "ai";

export interface DocConsolidatorDraft {
  version: 1;
  serviceName: string;
  customName: string;
  inputText: string;
  docUrl: string;
  result: string;
  resultMode: DocResultMode | null;
  updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResultMode(value: unknown): DocResultMode | null {
  if (value === "offline" || value === "ai") return value;
  return null;
}

export function createEmptyDocConsolidatorDraft(
  overrides: Partial<DocConsolidatorDraft> = {},
): DocConsolidatorDraft {
  return {
    version: 1,
    serviceName: overrides.serviceName ?? "",
    customName: overrides.customName ?? "",
    inputText: overrides.inputText ?? "",
    docUrl: overrides.docUrl ?? "",
    result: overrides.result ?? "",
    resultMode: overrides.resultMode ?? null,
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

export function loadDocConsolidatorDraft(): DocConsolidatorDraft | null {
  try {
    const raw = localStorage.getItem(DOC_CONSOLIDATOR_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.version !== 1) return null;
    return {
      version: 1,
      serviceName: typeof parsed.serviceName === "string" ? parsed.serviceName : "",
      customName: typeof parsed.customName === "string" ? parsed.customName : "",
      inputText: typeof parsed.inputText === "string" ? parsed.inputText : "",
      docUrl: typeof parsed.docUrl === "string" ? parsed.docUrl : "",
      result: typeof parsed.result === "string" ? parsed.result : "",
      resultMode: parseResultMode(parsed.resultMode),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveDocConsolidatorDraft(
  draft: Omit<DocConsolidatorDraft, "version" | "updatedAt"> & { updatedAt?: number },
): DocConsolidatorDraft {
  const full: DocConsolidatorDraft = {
    version: 1,
    serviceName: draft.serviceName,
    customName: draft.customName,
    inputText: draft.inputText,
    docUrl: draft.docUrl,
    result: draft.result,
    resultMode: draft.resultMode,
    updatedAt: draft.updatedAt ?? Date.now(),
  };
  try {
    localStorage.setItem(DOC_CONSOLIDATOR_DRAFT_KEY, JSON.stringify(full));
  } catch {
    // Quota / private mode — ignore.
  }
  return full;
}

export function clearDocConsolidatorDraft(): void {
  try {
    localStorage.removeItem(DOC_CONSOLIDATOR_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}