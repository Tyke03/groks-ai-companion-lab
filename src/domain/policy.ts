import type { FieldName, FieldPolicy, Origin } from "./card";
import { FIELD_REGISTRY } from "./fields";

export type LaunchPreset = "Seed & Rewrite" | "Fresh Roll" | "Pinned Anchor" | "Isolated";

/** Launch-modal labels → the policy the assembler reads. */
export function policyFromPreset(preset: LaunchPreset, origin: Origin = "manual"): FieldPolicy {
  switch (preset) {
    case "Pinned Anchor":
      return { locked: true, useAsContext: true, origin };
    case "Isolated":
      return { locked: true, useAsContext: false, origin };
    case "Fresh Roll":
      return { locked: false, useAsContext: false, origin: origin === "manual" ? "generated" : origin };
    case "Seed & Rewrite":
    default:
      return { locked: false, useAsContext: true, origin };
  }
}

export function presetFromPolicy(policy: FieldPolicy): LaunchPreset {
  if (policy.locked) return policy.useAsContext ? "Pinned Anchor" : "Isolated";
  return policy.useAsContext ? "Seed & Rewrite" : "Fresh Roll";
}

export function defaultPolicy(field: FieldName): FieldPolicy {
  const d = FIELD_REGISTRY[field].defaultPolicy;
  return { ...d };
}

/**
 * Map a builder toggle pair onto a pipeline policy.
 * Filled + locked + context = anchor. Filled + unlocked + context = raw seed.
 */
export function policyFromBuilder(
  field: FieldName,
  toggle: { locked: boolean; useAsContext: boolean } | undefined,
  hasText: boolean,
): FieldPolicy {
  const base = toggle ?? {
    locked: defaultPolicy(field).locked,
    useAsContext: defaultPolicy(field).useAsContext,
  };
  let origin: Origin = "generated";
  if (hasText && base.locked) origin = "manual";
  else if (hasText && !base.locked && base.useAsContext) origin = "imported_raw";
  else if (hasText) origin = "manual";
  return { locked: base.locked, useAsContext: base.useAsContext, origin };
}
