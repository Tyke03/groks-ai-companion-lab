/**
 * Light Workbench bridges — stash a short honest handoff between tools.
 * Not a project system: sessionStorage only, consumed once.
 */

export const WORKBENCH_BRIDGE_KEY = "ai-companion-hub-workbench-bridge";

export type WorkbenchBridgeTarget = "character" | "prompts";

export type WorkbenchApplyField = "system_prompt" | "post_history_instructions";

export interface WorkbenchBridgePayload {
  target: WorkbenchBridgeTarget;
  serviceName: string;
  /** Short note only — never dump an entire guide into a card field. */
  summary: string;
  createdAt: number;
  /** Optional Prompt Builder → Card field apply. */
  applyField?: WorkbenchApplyField;
  applyText?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildBridgeSummary(serviceName: string, resultPreview = ""): string {
  const name = serviceName.trim() || "Service";
  const preview = resultPreview.trim().replace(/\s+/g, " ").slice(0, 180);
  const lines = [
    "[From Doc Consolidator] Service: " + name,
    "Use the consolidator result as reference when filling card/prompt fields — this note is a handoff, not a full guide.",
  ];
  if (preview) {
    const ellipsis = resultPreview.trim().length > 180 ? "..." : "";
    lines.push("Preview: " + preview + ellipsis);
  }
  return lines.join("\n");
}

export function toolsTabPath(tab: WorkbenchBridgeTarget | "lorebook" | "consolidator" | "character"): string {
  return "/tools?tab=" + tab;
}

export function stashWorkbenchBridge(
  payload: Omit<WorkbenchBridgePayload, "createdAt">,
): WorkbenchBridgePayload {
  const full: WorkbenchBridgePayload = {
    ...payload,
    serviceName: payload.serviceName.trim() || "Service",
    summary: payload.summary.trim(),
    createdAt: Date.now(),
    applyField: payload.applyField,
    applyText: typeof payload.applyText === "string" ? payload.applyText : undefined,
  };
  try {
    sessionStorage.setItem(WORKBENCH_BRIDGE_KEY, JSON.stringify(full));
  } catch {
    // Ignore quota / private-mode failures — navigation still works.
  }
  return full;
}

export function peekWorkbenchBridge(): WorkbenchBridgePayload | null {
  try {
    const raw = sessionStorage.getItem(WORKBENCH_BRIDGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.target !== "character" && parsed.target !== "prompts") return null;
    if (typeof parsed.serviceName !== "string" || typeof parsed.summary !== "string") return null;
    const applyField =
      parsed.applyField === "system_prompt" || parsed.applyField === "post_history_instructions"
        ? parsed.applyField
        : undefined;
    return {
      target: parsed.target,
      serviceName: parsed.serviceName,
      summary: parsed.summary,
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      applyField,
      applyText: typeof parsed.applyText === "string" ? parsed.applyText : undefined,
    };
  } catch {
    return null;
  }
}

export function consumeWorkbenchBridge(target: WorkbenchBridgeTarget): WorkbenchBridgePayload | null {
  const payload = peekWorkbenchBridge();
  if (!payload || payload.target !== target) return null;
  try {
    sessionStorage.removeItem(WORKBENCH_BRIDGE_KEY);
  } catch {
    /* ignore */
  }
  return payload;
}

export function appendBridgeToNotes(existing: string, summary: string): string {
  const note = summary.trim();
  if (!note) return existing;
  const base = existing.trim();
  if (!base) return note;
  if (base.includes(note)) return existing;
  return base + "\n\n" + note;
}

/** Soft Compare → Workbench handoff (UI note only — no invented token ceilings). */
export function toolsPlatformPath(platformSlugs: string[], tab: WorkbenchBridgeTarget | "lorebook" | "consolidator" | "character" = "character"): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  const cleaned = platformSlugs.map((s) => s.trim()).filter(Boolean).slice(0, 5);
  if (cleaned.length) params.set("platform", cleaned.join(","));
  return "/tools?" + params.toString();
}
