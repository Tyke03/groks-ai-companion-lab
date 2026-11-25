import type { Finding, GateResult } from "./types";
import { gate } from "./types";

const MARKERS = ["*", "_", '"', "`"] as const;

function odd(text: string, marker: string): boolean {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === marker) n++;
  return n % 2 === 1;
}

/** Close one unmatched marker at the last clause end (before . ! ?), else at the end. */
function closeOne(text: string, marker: string): string {
  if (!odd(text, marker)) return text;
  const dot = Math.max(text.lastIndexOf("."), text.lastIndexOf("!"), text.lastIndexOf("?"));
  if (dot >= 0) return text.slice(0, dot) + marker + text.slice(dot);
  return text + marker;
}

export function balanceMarkdown(text: string): string {
  let out = text;
  for (const marker of MARKERS) out = closeOne(out, marker);
  return out;
}

export function validateMarkdown(field: string, text: string): GateResult {
  const findings: Finding[] = [];
  for (const marker of MARKERS) {
    if (odd(text, marker)) {
      findings.push({
        validator: "markdown",
        field,
        blocking: true,
        message: `unbalanced ${marker}`,
      });
    }
  }
  return gate(findings);
}
