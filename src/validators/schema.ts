import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import extractSchema from "../schemas/extract.json";
import planSchema from "../schemas/plan.json";
import auditSchema from "../schemas/audit.json";
import repairSchema from "../schemas/repair.json";
import deriveSchema from "../schemas/derive.json";
import greetingsSchema from "../schemas/greetings.json";
import cardSchema from "../schemas/card.json";
import type { GateResult } from "./types";
import { gate } from "./types";

const ajv = new Ajv({ strict: true, allErrors: true });

export const SCHEMA_NAMES = [
  "extract",
  "plan",
  "audit",
  "repair",
  "derive",
  "greetings",
  "card",
] as const;

export type SchemaName = (typeof SCHEMA_NAMES)[number];

const SCHEMAS: Record<SchemaName, object> = {
  extract: extractSchema,
  plan: planSchema,
  audit: auditSchema,
  repair: repairSchema,
  derive: deriveSchema,
  greetings: greetingsSchema,
  card: cardSchema,
};

const compiled = new Map<SchemaName, ValidateFunction>();

export function compileAll(): ValidateFunction[] {
  return SCHEMA_NAMES.map((name) => {
    const fn = ajv.compile(SCHEMAS[name]);
    compiled.set(name, fn);
    return fn;
  });
}

export function schemaBody(name: SchemaName): object {
  return SCHEMAS[name];
}

export function validateSchema(name: SchemaName, data: unknown): GateResult {
  if (!compiled.has(name)) compileAll();
  const fn = compiled.get(name)!;
  if (fn(data)) return gate([]);
  const msg = (fn.errors as ErrorObject[] | null | undefined)?.map((e) => `${e.instancePath} ${e.message}`).join("; ")
    || "schema mismatch";
  return gate([{ validator: "schema", field: name, blocking: true, message: msg }]);
}
