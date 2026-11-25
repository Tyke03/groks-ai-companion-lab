// src/lib/cardGeneratePipeline.ts
import { supabase } from "@/integrations/supabase/client";
import { withAiProvider } from "@/lib/aiProvider";
import {
  applyGenerateFieldResult,
  ensureOriginalMacro,
  normalizeAiMultiline,
  normalizeCardTags,
  parseAiStringList,
  quoteUnquotedUserLines,
  replaceLiteralCharName,
  rewriteSpeakerLabels,
  sanitizeCardData,
  sanitizeCardMacros,
} from "@/lib/cardAiFormat";
import {
  ARRAY_FIELDS,
  CARD_DATA_KEYS,
  FIELD_CHAR_BUDGETS,
  FIELD_DEPENDENCY_RANK,
  FIELD_HINTS,
  hasFieldText,
  resolveEffectivePolicies,
  type FieldPolicies,
  type FieldPolicy,
  type WholeCardRunMode,
} from "@/lib/cardFieldMeta";
import type { CardData } from "@/lib/cardTypes";
import { edgeInvokeError } from "@/lib/llmErrors";
import { cardFromBuilder, briefToText } from "@/pipeline/fromBuilder";
import { generateCard } from "@/pipeline/generateCard";
import { createSupabaseLlm } from "@/llm/supabaseClient";

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

export interface StageFieldDef {
  field: keyof CardData;
  temperature: number;
  v3Only?: boolean;
}

export interface StageDef {
  id: string;
  label: string;
  fields: StageFieldDef[];
  requires: (keyof CardData)[];
}

export const STAGES: StageDef[] = [
  {
    id: "intake",
    label: "Naming",
    requires: [],
    fields: [
      { field: "name", temperature: 0.8 },
      { field: "nickname", temperature: 0.5, v3Only: true },
    ],
  },
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
    fields: [
      { field: "alternate_greetings", temperature: 0.85 },
      { field: "group_only_greetings", temperature: 0.8, v3Only: true },
    ],
  },
  {
    id: "meta",
    label: "Meta",
    requires: [],
    fields: [
      { field: "creator_notes", temperature: 0.6 },
      { field: "post_history_instructions", temperature: 0.4 },
      { field: "tags", temperature: 0.5 },
    ],
  },
];

export interface FieldContextPayload {
  existingFields: Partial<CardData>;
  fieldPolicies: FieldPolicies;
}

/**
 * Filter card fields into Tier A (Locked + Include) and Tier B (Unlocked + Include)
 * context for an AI request while respecting:
 * - Exclude policy (`useAsContext === false`) -> completely omitted
 * - Target field self-anchoring prevention:
 *   - Refine passes exclude targetField from context (sent once as currentValue)
 *   - Fresh Roll (`!locked && !useAsContext`) omits targetField completely
 *   - Seed & Rewrite (`!locked && useAsContext`) includes targetField as a Tier B seed
 * - Downstream-only flow: unlocked fields after `targetField` only feed upstream
 *   when no upstream body field (`rank >= 2 && rank <= targetRank`) has context yet
 *   (e.g. a raw blob pasted into a lower box). Locked+Include anchors always flow anywhere.
 */
export function buildFieldContextPayload(
  card: CardData,
  policies: FieldPolicies | undefined,
  opts?: {
    targetField?: keyof CardData;
    isRefine?: boolean;
    runMode?: WholeCardRunMode;
    resolvedOverride?: Record<keyof CardData, FieldPolicy>;
  },
): FieldContextPayload {
  const sanitized = sanitizeCardData(card);
  const effective =
    opts?.resolvedOverride ??
    resolveEffectivePolicies(sanitized, policies, opts?.runMode ?? "stored");
  const targetField = opts?.targetField;
  const isRefine = opts?.isRefine === true;
  const targetRank = targetField ? FIELD_DEPENDENCY_RANK[targetField] : Number.POSITIVE_INFINITY;

  const hasUpstreamBodySeed = targetField
    ? CARD_DATA_KEYS.some((k) => {
        if (k === targetField) return false;
        const rank = FIELD_DEPENDENCY_RANK[k];
        return rank >= 2 && rank <= targetRank && effective[k].useAsContext && hasFieldText(sanitized[k]);
      })
    : true;

  const existingFields: Partial<CardData> = {};
  const fieldPolicies: FieldPolicies = {};

  for (const key of CARD_DATA_KEYS) {
    const policy = effective[key];
    if (!policy.useAsContext) continue;
    if (!hasFieldText(sanitized[key])) continue;

    if (targetField && key === targetField) {
      if (isRefine || policy.locked) continue;
      // Target field is Unlocked + Include -> send explicitly as Tier B seed
      (existingFields as Record<string, unknown>)[key] = sanitized[key];
      fieldPolicies[key] = { ...policy };
      continue;
    }

    if (targetField && !policy.locked) {
      const rank = FIELD_DEPENDENCY_RANK[key];
      if (rank > targetRank && hasUpstreamBodySeed) {
        continue;
      }
    }

    (existingFields as Record<string, unknown>)[key] = sanitized[key];
    fieldPolicies[key] = { ...policy };
  }

  return { existingFields, fieldPolicies };
}

export function applyFieldResult(card: CardData, fieldName: keyof CardData, raw: unknown): CardData {
  const { value } = applyGenerateFieldResult(String(fieldName), raw);
  const next = { ...card };
  const charName = String(card.name ?? "").trim();
  if (ARRAY_FIELDS.has(fieldName)) {
    const max = fieldName === "alternate_greetings" || fieldName === "group_only_greetings" ? 3 : undefined;
    (next[fieldName] as string[]) = parseAiStringList(value, { max }).map((s) =>
      sanitizeCardMacros(
        fieldName === "alternate_greetings" || fieldName === "group_only_greetings"
          ? rewriteSpeakerLabels(s, charName)
          : s,
        String(fieldName),
      ),
    );
  } else if (fieldName === "mes_example" || fieldName === "first_mes") {
    const cleaned = sanitizeCardMacros(
      rewriteSpeakerLabels(normalizeAiMultiline(String(value ?? "")), charName),
      String(fieldName),
    );
    (next[fieldName] as string) = fieldName === "mes_example" ? quoteUnquotedUserLines(cleaned) : cleaned;
  } else if (fieldName === "tags") {
    (next.tags as string) = normalizeCardTags(
      typeof value === "string" ? value : value == null ? "" : String(value),
    );
  } else if (fieldName === "system_prompt" || fieldName === "post_history_instructions") {
    const cleaned = sanitizeCardMacros(
      typeof value === "string" ? value : value == null ? "" : String(value),
      String(fieldName),
      charName,
    );
    (next[fieldName] as string) = cleaned.trim()
      ? ensureOriginalMacro(replaceLiteralCharName(cleaned, charName))
      : "";
  } else {
    (next[fieldName] as string) = sanitizeCardMacros(
      typeof value === "string" ? value : value == null ? "" : String(value),
      String(fieldName),
      charName,
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
  fieldPolicies?: FieldPolicies;
  runMode?: WholeCardRunMode;
  only?: (keyof CardData)[];
  protectExisting?: boolean;
  /** Multi-turn staged conversation (frozen server-side primer + append-only history). */
  conversation?: StageConversation;
  /** User opt-in. A V3 card is not a group card unless this is set. */
  groupCard?: boolean;
  onFieldStart?: (field: keyof CardData, stageId: string) => void;
  onFieldDone?: (o: FieldOutcome) => void;
  control?: { aborted: boolean };
}

export interface RunResult {
  card: CardData;
  outcomes: FieldOutcome[];
  aborted: boolean;
}

/* ---------- Multi-turn staged conversation (companion to venice-ai `stage-turn`) ---------- */
export interface StageConversationTurn {
  role: "user" | "assistant";
  content: string;
}
export interface StageConversation {
  history: StageConversationTurn[];
  /** Final text per field as the model last saw it — used to detect creator edits between runs. */
  covered: Partial<Record<keyof CardData, string>>;
}
export function createStageConversation(): StageConversation {
  return { history: [], covered: {} };
}
const coveredText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "")).join("\n\n<START>\n");
  return String(value ?? "");
};
/** Record of the last stage-turn request (for tests + debugging). */
export interface StageTurnDebug {
  field: keyof CardData;
  historyTurns: number;
}
const lastStageTurns: StageTurnDebug[] = [];
export function getLastStageTurns(): StageTurnDebug[] {
  return lastStageTurns;
}

function buildContextTurn(
  brief: CompanionBrief,
  existingFields: Partial<CardData>,
  fieldPolicies: FieldPolicies,
  specVersion: "v2" | "v3",
): string {
  const lines: string[] = ["SESSION CONTEXT (first turn — authoritative for this card):"];
  const briefLines = [
    brief.setting && `- Setting / genre: ${brief.setting}`,
    brief.role && `- Role / occupation: ${brief.role}`,
    brief.agePresentation && `- Age presentation: ${brief.agePresentation}`,
    brief.tone && `- Tone register: ${brief.tone}`,
    brief.replyLength && `- Target reply length: ${brief.replyLength}`,
    brief.relationship && `- Relationship with {{user}}: ${brief.relationship}`,
    brief.pov && `- POV / tense: ${brief.pov}`,
    brief.language && `- Language: ${brief.language}`,
    brief.contentLevel && `- Content level: ${brief.contentLevel}`,
    brief.mustInclude && `- Must include: ${brief.mustInclude}`,
    brief.bannedPhrases && `- Never use: ${brief.bannedPhrases}`,
  ].filter(Boolean) as string[];
  if (briefLines.length > 0) lines.push("CREATOR BRIEF:", ...briefLines);
  const seedLines = (Object.keys(existingFields) as (keyof CardData)[])
    .filter((k) => hasFieldText(existingFields[k]))
    .map((k) => {
      const locked = fieldPolicies[k]?.locked ? "[LOCKED ANCHOR — keep verbatim, never contradict] " : "[SEED — extract facts/intent, rewrite cleanly] ";
      return `${locked}${k}: ${coveredText(existingFields[k])}`;
    });
  if (seedLines.length > 0) lines.push("SEEDS / ANCHORS:", ...seedLines);
  lines.push(`Card spec: ${specVersion === "v3" ? "V3" : "V2-flat"}.`);
  lines.push("Each following turn names one field; reply with only that field's text.");
  return lines.join("\n");
}

function stagePolicyKey(policy: FieldPolicy): "seed" | "anchor" | "isolated" {
  if (policy.locked) return "anchor";
  if (!policy.useAsContext) return "isolated";
  return "seed";
}

/**
 * Client-side mirror of venice-ai buildStageTurnPrompt — the text appended to the
 * conversation history MUST byte-match what the server sends the model, so the
 * prefix stays cacheable. If the two ever drift, the only cost is a cache miss.
 */
function buildStageTurnText(field: keyof CardData, policyKey: "seed" | "anchor" | "isolated"): string {
  const budget = FIELD_CHAR_BUDGETS[field];
  const aim = typeof budget === "number" ? Math.round(budget * 0.9) : null;
  const policyLabel = policyKey === "anchor" ? "Pinned Anchor" : policyKey === "isolated" ? "Isolated" : "Seed & Rewrite";
  const lines = [`FIELD: ${String(field)}`, `POLICY: ${policyLabel}`];
  if (typeof budget === "number") lines.push(`BUDGET: ${budget} characters max (aim ~${aim})`);
  lines.push(
    policyKey === "isolated"
      ? `TASK: Write ${String(field)} from the creator brief alone. Other fields' content is not available; do not invent facts from them.`
      : `TASK: Write ${String(field)} for {{char}} from what the conversation already established. Do not restate content earlier turns claimed.`,
  );
  lines.push("OUTPUT: only the field text.");
  return lines.join("\n");
}

/** Append a turn pair for a successful stage; returns nothing (mutates in place). */
function recordStageTurn(
  conversation: StageConversation,
  userTurn: string,
  assistantTurn: string,
  field: keyof CardData,
  finalValue: string,
): void {
  conversation.history.push({ role: "user", content: userTurn });
  conversation.history.push({ role: "assistant", content: assistantTurn });
  conversation.covered[field] = finalValue;
  lastStageTurns.push({ field, historyTurns: conversation.history.length });
  if (lastStageTurns.length > 40) lastStageTurns.shift();
}

const hasBriefSignal = (brief: CompanionBrief): boolean => seedStrength(brief) > 0;

export async function runStagedGeneration(opts: RunOptions): Promise<RunResult> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const protect = opts.protectExisting ?? true;
  const only = opts.only ? new Set(opts.only) : null;
  const usePolicyMatrix = opts.fieldPolicies !== undefined || opts.runMode !== undefined;
  const outcomes: FieldOutcome[] = [];
  let working = sanitizeCardData({ ...opts.card });

  const effectivePolicies = resolveEffectivePolicies(
    working,
    opts.fieldPolicies,
    opts.runMode ?? (protect ? "empty-only" : "rewrite-with-context"),
  );

  const gapMs =
    typeof import.meta !== "undefined" &&
    (import.meta as { env?: { MODE?: string } }).env?.MODE === "test"
      ? 0
      : 350;

  if (opts.conversation) {
    const authoring = cardFromBuilder(working, effectivePolicies, {
      groupCard: opts.groupCard === true,
    });
    const generated = await generateCard(authoring, {
      llm: createSupabaseLlm(),
      cardId: "builder",
      brief: briefToText(opts.brief),
      planMode: "always",
      control: opts.control,
      onFieldStart: (field) => opts.onFieldStart?.(field as keyof CardData, field),
      onFieldDone: (field, status, provider) => {
        if (status !== "filled") return;
        const outcome: FieldOutcome = {
          field: field as keyof CardData,
          stageId: field,
          status: "filled",
          provider,
        };
        outcomes.push(outcome);
        opts.onFieldDone?.(outcome);
      },
    });
    for (const outcome of generated.outcomes) {
      if (outcome.status === "filled") {
        working = applyFieldResult(working, outcome.field as keyof CardData, authoring.fields[outcome.field].value);
        if (!outcomes.some((existing) => existing.field === outcome.field && existing.status === "filled")) {
          outcomes.push({
            field: outcome.field as keyof CardData,
            stageId: outcome.field,
            status: "filled",
          });
        }
        continue;
      }
      outcomes.push({
        field: outcome.field as keyof CardData,
        stageId: outcome.field,
        status: outcome.status === "blocked" || outcome.status === "cost" ? "failed" : "skipped",
      });
    }
    if (generated.aborted || opts.control?.aborted) {
      return { card: sanitizeCardData(working), outcomes, aborted: true };
    }
    return { card: sanitizeCardData(working), outcomes, aborted: false };
  }

  for (const stage of STAGES) {
    if (opts.control?.aborted) return { card: working, outcomes, aborted: true };

    const anyContextSeed =
      hasBriefSignal(opts.brief) ||
      CARD_DATA_KEYS.some((k) => effectivePolicies[k].useAsContext && hasFieldText(working[k]));
    const reqsMet = stage.requires.every((f) => hasFieldText(working[f])) || (usePolicyMatrix && anyContextSeed);

    if (!reqsMet) {
      for (const { field, v3Only } of stage.fields) {
        if (v3Only && opts.specVersion !== "v3" && !only?.has(field)) continue;
        outcomes.push({ field, stageId: stage.id, status: "skipped" });
      }
      continue;
    }

    for (const { field, temperature, v3Only } of stage.fields) {
      if (opts.control?.aborted) return { card: working, outcomes, aborted: true };
      if (v3Only && opts.specVersion !== "v3" && !only?.has(field)) {
        continue;
      }
      if (only && !only.has(field)) {
        outcomes.push({ field, stageId: stage.id, status: "skipped" });
        continue;
      }

      if (usePolicyMatrix) {
        if (effectivePolicies[field].locked && !only?.has(field)) {
          outcomes.push({ field, stageId: stage.id, status: "skipped" });
          continue;
        }
      } else if (protect && hasFieldText(working[field]) && !only?.has(field)) {
        outcomes.push({ field, stageId: stage.id, status: "skipped" });
        continue;
      }

      opts.onFieldStart?.(field, stage.id);
      const started = Date.now();
      try {
        const conversation = opts.conversation;
        if (conversation) {
          /* --- Multi-turn staged path: append-only history + frozen server-side primer --- */
          // Creator edits between runs become authoritative UPDATED turns (never rewrite old turns).
          for (const [k, seen] of Object.entries(conversation.covered)) {
            const editedField = k as keyof CardData;
            const current = coveredText(working[editedField]);
            if (current && seen && current !== seen) {
              conversation.history.push({ role: "user", content: `UPDATED ${editedField} (authoritative):\n${current}` });
              conversation.covered[editedField] = current;
            }
          }
          if (conversation.history.length === 0) {
            const ctx = buildFieldContextPayload(working, opts.fieldPolicies, {
              resolvedOverride: effectivePolicies,
            });
            conversation.history.push({
              role: "user",
              content: buildContextTurn(opts.brief, ctx.existingFields, ctx.fieldPolicies, opts.specVersion),
            });
          }
          const policyKey = stagePolicyKey(effectivePolicies[field]);
          const turnText = buildStageTurnText(field, policyKey);
          const { data, error } = await supabase.functions.invoke("venice-ai", {
            body: withAiProvider({
              action: "stage-turn",
              fieldName: field,
              brief: opts.brief,
              history: conversation.history,
              stage: {
                field,
                policy: policyKey,
                temperature,
                charName: String(working.name ?? "").trim(),
                turnText,
              },
            }),
          });
          if (error) throw new Error(await edgeInvokeError(error, data));
          if (data?.error) throw new Error(String(data.error));
          if (data?.result === undefined || data?.result === null || data?.result === "") {
            throw new Error("Empty result");
          }
          working = applyFieldResult(working, field, data.result);
          effectivePolicies[field] = { locked: false, useAsContext: true };
          const finalText = coveredText(working[field]);
          recordStageTurn(conversation, turnText, finalText, field, finalText);
          const outcome: FieldOutcome = {
            field,
            stageId: stage.id,
            status: "filled",
            provider: data.provider,
            ms: Date.now() - started,
          };
          outcomes.push(outcome);
          opts.onFieldDone?.(outcome);
        } else {
          const { existingFields, fieldPolicies } = buildFieldContextPayload(working, opts.fieldPolicies, {
            targetField: field,
            resolvedOverride: effectivePolicies,
          });

          const { data, error } = await supabase.functions.invoke("venice-ai", {
            body: withAiProvider({
              action: "generate-field",
              fieldName: field,
              fieldDescription: FIELD_HINTS[field],
              existingFields,
              fieldPolicies,
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
          // Freshly drafted AI field becomes available as an unlocked context seed for downstream stages
          effectivePolicies[field] = { locked: false, useAsContext: true };
          const outcome: FieldOutcome = {
            field,
            stageId: stage.id,
            status: "filled",
            provider: data.provider,
            ms: Date.now() - started,
          };
          outcomes.push(outcome);
          opts.onFieldDone?.(outcome);
        }
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

  // Non-fatal cross-field timeline/fact consistency check after full staged runs
  const isTestMode =
    typeof import.meta !== "undefined" &&
    (import.meta as { env?: { MODE?: string } }).env?.MODE === "test";
  if (
    !isTestMode &&
    !only &&
    !opts.control?.aborted &&
    hasFieldText(working.description) &&
    (hasFieldText(working.mes_example) || hasFieldText(working.first_mes))
  ) {
    try {
      const { data } = await supabase.functions.invoke("venice-ai", {
        body: withAiProvider({
          action: "consistency-check",
          existingFields: {
            name: working.name,
            description: working.description,
            personality: working.personality,
            scenario: working.scenario,
            first_mes: working.first_mes,
            mes_example: working.mes_example,
            system_prompt: working.system_prompt,
          },
          fieldPolicies: effectivePolicies,
        }),
      });
      const patches = data?.patches;
      if (patches && typeof patches === "object") {
        for (const [key, val] of Object.entries(patches as Record<string, unknown>)) {
          if (typeof val !== "string" || !val.trim()) continue;
          const k = key as keyof CardData;
          if (effectivePolicies[k]?.locked) continue;
          working = applyFieldResult(working, k, val);
        }
      }
    } catch {
      // Non-fatal: keep staged results intact if consistency check fails
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
