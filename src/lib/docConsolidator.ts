/**
 * Pure helpers for Documentation Consolidator (offline draft + AI result handling).
 * Kept free of React so unit tests can cover paste inclusion and empty-AI failure.
 */

export function buildOfflineGuideSkeleton(service: string, pastedNotes = ""): string {
  const title = service.trim() || "Service";
  const notes = pastedNotes.trim();
  const fence = "`" + "`" + "`";

  const notesBlock = notes
    ? [
        "## Pasted notes (source material)",
        "",
        "The text below was pasted by you. Use it to fill the sections that follow - do not invent facts that are not supported here or in official docs.",
        "",
        fence,
        notes,
        fence,
        "",
        "",
      ].join("\n")
    : [
        "## Pasted notes (source material)",
        "",
        "_(No notes were pasted yet. Paste documentation into the input box, then insert this skeleton again to include them here.)_",
        "",
        "",
      ].join("\n");

  return [
    `# ${title} - local guide skeleton`,
    "",
    "> Drafted offline in AI Companion Hub. Fill each section from official docs or your own notes. AI consolidation is optional.",
    "",
    notesBlock,
    "## Overview",
    "- What this product is:",
    "- Who it is for:",
    "- Honest limits (UI-only? needs a backend? account required?):",
    "",
    "## Setup",
    "1.",
    "2.",
    "3.",
    "",
    "## Character creation",
    "- Card / persona format supported:",
    "- Where to import or create characters:",
    "- Tips:",
    "",
    "## API / backends",
    "- Built-in model vs bring-your-own:",
    "- Compatible APIs / backends:",
    "- Config notes:",
    "",
    "## Content / NSFW notes",
    "- Policy is **backend-dependent** for many UIs (especially SillyTavern-style frontends).",
    "- Do **not** claim the product is uncensored unless the official docs say so for a specific model/host.",
    "- Note what you verified, and on which model/backend:",
    "",
    "## Troubleshooting",
    "- Common install / connection issues:",
    "- Where to find logs:",
    "- Links you used:",
    "",
    "## Sources",
    "- Official docs:",
    "- GitHub / release notes:",
    "- Last checked:",
    "",
  ].join("\n");
}

export type ConsolidateOutcome =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Treat missing/blank AI consolidate payloads as hard failures (never success).
 */
export function interpretConsolidateResponse(data: unknown, invokeError?: unknown): ConsolidateOutcome {
  if (invokeError) {
    let message = String(invokeError);
    if (invokeError instanceof Error) {
      message = invokeError.message;
    } else if (
      typeof invokeError === "object" &&
      invokeError !== null &&
      "message" in invokeError &&
      typeof (invokeError as { message: unknown }).message === "string"
    ) {
      message = (invokeError as { message: string }).message;
    }
    return { ok: false, error: message || "Failed to process documentation." };
  }

  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === "string" && err.trim()) {
      return { ok: false, error: err.trim() };
    }
  }

  const raw =
    data && typeof data === "object" && "result" in data
      ? (data as { result: unknown }).result
      : undefined;

  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    return {
      ok: false,
      error:
        "AI returned an empty result. Try again, shorten the input, or use Draft offline with your pasted notes.",
    };
  }

  return { ok: true, text };
}
