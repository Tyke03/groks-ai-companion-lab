// src/lib/cardGeneratePipeline.ts
import { supabase } from "@/integrations/supabase/client";
import { withAiProvider } from "@/lib/aiProvider";
import {
  applyGenerateFieldResult,
  normalizeAiMultiline,
  parseAiStringList,
  rewriteSpeakerLabels,
  sanitizeCardData,
  sanitizeCardMacros,
} from "@/lib/cardAiFormat";
import { ARRAY_FIELDS, FIELD_HINTS } from "@/lib/cardFieldMeta";
import type { CardData } from "@/lib/cardTypes";
import { edgeInvokeError } from "@/lib/llmErrors";

export interface CompanionBrief {
  setting?: string;
  role?: string;
  agePresentation?: string;
  tone?: string;
  replyLength?: string;
  voiceSample?: string;
  bannedPhrases?: string;
  relationship?: string;
  pov?: string;
  language?: string;
  contentLevel?: 1 | 2 | 3 | 4 | 5;
  mustInclude?: string;
}

export interface StageDef {
  id: string;
  label: string;
  fields: { field: keyof CardData; temperature: number }[];
  requires: (keyof CardData)[];
}

export const STAGES: StageDef[] = [
  {
    id: "identity",
    label: "Identity",
    requires: [],
    fields: [
      { field: "description", temperature: 0.75 },
      { field: "personality", temperature: 0.8 },
    ],
  },
  {
    id: "world",
    label: "World",
    requires: ["description", "personality"],
    fields: [{ field: "scenario", temperature: 0.7 }],
  },
  {
    id: "voice",
    label: "Voice",
    requires: ["personality", "scenario"],
    fields: [
      { field: "first_mes", temperature: 0.85 },
      { field: "system_prompt", temperature: 0.5 },
    ],
  },
  {
    id: "examples",
    label: "Examples",
    requires: ["first_mes", "personality"],
    fields: [{ field: "mes_example", temperature: 0.8 }],
  },
  {
    id: "openers",
    label: "Alternate openers",
    requires: ["first_mes", "mes_example"],
    fields: [{ field: "alternate_greetings", temperature: 0.85 }],
  },
  {
    id: "meta",
    label: "Meta",
    requires: [],
    fields: [
      { field: "creator_notes", temperature: 0.6 },
      { field: "post_history_instructions", temperature: 0.4 },
    ],
  },
];

export function applyFieldResult(card: CardData, fieldName: keyof CardData, raw: unknown): CardData {
  const { value } = applyGenerateFieldResult(String(fieldName), raw);
  const next = { ...card };
  const charName = String(card.name ?? "").trim();
  if (ARRAY_FIELDS.has(fieldName)) {
    const max = fieldName === "alternate_greetings" ? 3 : undefined;
    (next[fieldName] as string[]) = parseAiStringList(value, { max }).map((s) =>
      sanitizeCardMacros(
        fieldName === "alternate_greetings" || fieldName === "group_only_greetings"
          ? rewriteSpeakerLabels(s, charName)
          : s,
        String(fieldName),
      ),
    );
  } else if (fieldName === "mes_example" || fieldName === "first_mes") {
    (next[fieldName] as string) = sanitizeCardMacros(
      rewriteSpeakerLabels(normalizeAiMultiline(String(value ?? "")), charName),
      String(fieldName),
    );
  } else {
    (next[fieldName] as string) = sanitizeCardMacros(
      typeof value === "string" ? value : value == null ? "" : String(value),
      String(fieldName),
    );
  }
  return next;
}

export interface FieldOutcome {
  field: keyof CardData;
  stageId: string;
  status: "filled" | "skipped" | "failed";
  provider?: string;
  ms?: number;
  error?: string;
}

export interface RunOptions {
  card: CardData;
  brief: CompanionBrief;
  specVersion: "v2" | "v3";
  only?: (keyof CardData)[];
  protectExisting?: boolean;
  onFieldStart?: (field: keyof CardData, stageId: string) => void;
  onFieldDone?: (o: FieldOutcome) => void;
  control?: { aborted: boolean };
}

export interface RunResult {
  card: CardData;
  outcomes: FieldOutcome[];
  aborted: boolean;
}

const hasText = (v: unknown): boolean =>
  typeof v === "string"
    ? v.trim().length > 0
    : Array.isArray(v)
      ? v.some((x) => String(x ?? "").trim().length > 0)
      : false;

export async function runStagedGeneration(opts: RunOptions): Promise<RunResult> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const protect = opts.protectExisting ?? true;
  const only = opts.only ? new Set(opts.only) : null;
  const outcomes: FieldOutcome[] = [];
  let working = sanitizeCardData({ ...opts.card });
  const gapMs =
    typeof import.meta !== "undefined" &&
    (import.meta as { env?: { MODE?: string } }).env?.MODE === "test"
      ? 0
      : 350;

  for (const stage of STAGES) {
    if (opts.control?.aborted) return { card: working, outcomes, aborted: true };
    if (!stage.requires.every((f) => hasText(working[f]))) {
      for (const { field } of stage.fields) outcomes.push({ field, stageId: stage.id, status: "skipped" });
      continue;
    }
    for (const { field, temperature } of stage.fields) {
      if (opts.control?.aborted) return { card: working, outcomes, aborted: true };
      if (only && !only.has(field)) {
        outcomes.push({ field, stageId: stage.id, status: "skipped" });
        continue;
      }
      if (protect && hasText(working[field]) && !only?.has(field)) {
        outcomes.push({ field, stageId: stage.id, status: "skipped" });
        continue;
      }
      opts.onFieldStart?.(field, stage.id);
      const started = Date.now();
      try {
        const sanitizedContext = sanitizeCardData(working);
        const { data, error } = await supabase.functions.invoke("venice-ai", {
          body: withAiProvider({
            action: "generate-field",
            fieldName: field,
            fieldDescription: FIELD_HINTS[field],
            existingFields: sanitizedContext,
            specVersion: opts.specVersion,
            brief: opts.brief,
            temperature,
          }),
        });
        if (error) throw new Error(await edgeInvokeError(error, data));
        if (data?.error) throw new Error(String(data.error));
        if (data?.result === undefined || data?.result === null || data?.result === "") {
          throw new Error("Empty result");
        }
        working = applyFieldResult(working, field, data.result);
        const outcome: FieldOutcome = {
          field,
          stageId: stage.id,
          status: "filled",
          provider: data.provider,
          ms: Date.now() - started,
        };
        outcomes.push(outcome);
        opts.onFieldDone?.(outcome);
      } catch (err) {
        const outcome: FieldOutcome = {
          field,
          stageId: stage.id,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          ms: Date.now() - started,
        };
        outcomes.push(outcome);
        opts.onFieldDone?.(outcome);
      }
      if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs)); // courtesy gap vs per-minute limits
    }
  }
  return { card: working, outcomes, aborted: false };
}

/** 0-100. How much real steering signal the brief provides. */
export function seedStrength(brief: CompanionBrief): number {
  const checks = [
    !!brief.setting?.trim(),
    !!brief.role?.trim(),
    !!brief.tone?.trim(),
    !!brief.replyLength?.trim(),
    !!brief.voiceSample?.trim(),
    !!brief.relationship?.trim(),
    !!brief.pov?.trim(),
    !!brief.language?.trim(),
    !!brief.contentLevel,
    !!brief.mustInclude?.trim(),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
