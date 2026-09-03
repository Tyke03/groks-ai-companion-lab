import { z } from "zod";

/**
 * Zod schemas for character-card validation.
 *
 * These schemas are intentionally structural rather than exhaustive: they prove
 * that an input has the required envelope/shape before we trust it, while the
 * codec (`cardCodec.ts`) handles field mapping and opaque preservation of
 * anything outside the known schema.
 */

/** A V3 draft asset: `type`, `uri`, `name`, and `ext` are all required strings. */
export const assetSchema = z.object({
  type: z.string(),
  uri: z.string(),
  name: z.string(),
  ext: z.string(),
});

/**
 * Strict asset schema. Per the V3 draft spec, `ext` MUST be lowercase and MUST
 * be a valid file extension without a leading dot (e.g. `png`, `jpeg`, `webp`).
 */
export const strictAssetSchema = assetSchema.extend({
  ext: z
    .string()
    .regex(/^[a-z0-9]+$/, "ext must be lowercase without a leading dot"),
});

export const v2EnvelopeSchema = z.object({
  spec: z.literal("chara_card_v2"),
  spec_version: z.string().optional(),
  data: z.record(z.unknown()),
});

export const v3EnvelopeSchema = z.object({
  spec: z.literal("chara_card_v3"),
  spec_version: z.string().optional(),
  data: z.record(z.unknown()),
});
