import { z } from "zod";

// What a menu photo becomes. The model fills `AiMenu`; the review screen adds
// `reviewed` per dish and keeps the result as `MenuDraft` until it's applied.

export const IMPORT_LOCALES = ["hy", "ru", "en"] as const;
const MAX_PRICE = 10_000_000;

const names = (max: number) =>
  z.object({
    hy: z.string().trim().max(max),
    ru: z.string().trim().max(max),
    en: z.string().trim().max(max),
  });

const price = z.number().int().min(0).max(MAX_PRICE).nullable();

const aiVariant = z.object({
  names: names(80),
  price_amd: price,
  price_text: z.string().max(60),
});

const aiItem = z.object({
  names: names(120),
  descriptions: names(600),
  price_amd: price,
  price_text: z.string().max(60),
  confidence: z.number().min(0).max(1),
  variants: z.array(aiVariant).max(8),
});

const aiCategory = z.object({
  names: names(80),
  items: z.array(aiItem).max(200),
});

export const aiMenu = z.object({
  source_locale: z.enum(IMPORT_LOCALES),
  categories: z.array(aiCategory).min(1).max(60),
});

export const draftItem = aiItem.extend({ reviewed: z.boolean().default(false) });
export const draftCategory = aiCategory.extend({ items: z.array(draftItem).max(200) });
export const menuDraft = aiMenu.extend({ categories: z.array(draftCategory).min(1).max(60) });

export type AiMenu = z.infer<typeof aiMenu>;
export type MenuDraft = z.infer<typeof menuDraft>;
export type DraftCategory = z.infer<typeof draftCategory>;
export type DraftItem = z.infer<typeof draftItem>;
export type DraftVariant = z.infer<typeof aiVariant>;
export type ImportLocale = (typeof IMPORT_LOCALES)[number];

// Below this the review screen asks the owner to look at the price.
export const LOW_CONFIDENCE = 0.7;

// JSON Schema for the providers' structured output. Length and count limits
// are left out: Gemini answers 400 to a schema with that many constraints.
// The Zod schema checks them on the reply instead.
const PROVIDER_UNSUPPORTED = new Set([
  "$schema",
  "maxLength",
  "minLength",
  "maxItems",
  "minItems",
  "minimum",
  "maximum",
]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !PROVIDER_UNSUPPORTED.has(key))
      .map(([key, value]) => [key, strip(value)]),
  );
}

export function aiMenuJsonSchema(): Record<string, unknown> {
  return strip(z.toJSONSchema(aiMenu, { target: "draft-2020-12" })) as Record<string, unknown>;
}
