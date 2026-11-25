import type { Card, CardMeta, FieldName, FieldPolicy, FieldState } from "./card";
import { FIELD_NAMES, SPEC, SPEC_VERSION } from "./card";
import { FIELD_REGISTRY } from "./fields";

export function createEmptyCard(meta: Partial<CardMeta> = {}): Card {
  const now = Date.now();
  const fields = {} as Record<FieldName, FieldState>;
  for (const name of FIELD_NAMES) {
    const def = FIELD_REGISTRY[name];
    fields[name] = {
      value: def.format === "array" ? [] : "",
      policy: { ...def.defaultPolicy },
      tokens: 0,
      dirty: false,
    };
  }
  return {
    spec: SPEC,
    spec_version: SPEC_VERSION,
    data: {
      name: "",
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      alternate_greetings: [],
      group_only_greetings: [],
      mes_example: "",
      system_prompt: "",
      post_history_instructions: "",
      creator_notes: "",
      creator: "",
      character_version: "",
      tags: [],
      extensions: {},
      creation_date: now,
      modification_date: now,
    },
    fields,
    meta: { groupCard: false, realPerson: false, ...meta },
  };
}

export function writeField(
  card: Card,
  name: FieldName,
  value: string | string[],
  policy?: Partial<FieldPolicy>,
): void {
  const prev = card.fields[name];
  card.fields[name] = {
    value,
    policy: { ...prev.policy, ...policy },
    tokens: prev.tokens,
    dirty: true,
  };
}
