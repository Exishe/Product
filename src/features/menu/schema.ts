import { z } from "zod";
import { ALLERGENS } from "./guest-menu/allergens";

// Diet tags first (they answer "can I eat this?"), then the café's own notes.
// The same list the guest menu reads and api.save_item accepts.
export const DISH_TAGS = [
  "vegan",
  "vegetarian",
  "gluten_free",
  "lactose_free",
  "spicy",
  "new",
  "chefs_pick",
  "popular",
] as const;

// Owners type prices as "2500", "2 500" or "2 500 ֏". Whole drams only.
export function parsePriceInput(raw: string): number | null {
  const compact = raw.replace(/[\s ֏]/g, "");
  if (!/^\d{1,8}$/.test(compact)) return null;
  return Number(compact);
}

// Option price changes can be negative ("-200" for a smaller size). Same spacing and ֏ as
// parsePriceInput, limited to what the database allows (-1,000,000..1,000,000).
export function parseDeltaInput(raw: string): number | null {
  const compact = raw.replace(/[\s֏]/g, "");
  if (!/^-?\d{1,7}$/.test(compact)) return null;
  const n = Number(compact);
  return Math.abs(n) <= 1_000_000 ? n : null;
}

const name = (max: number) => z.string().trim().max(max);
const perLocale = (max: number) => z.object({ hy: name(max), ru: name(max), en: name(max) });

export const dishInput = z.object({
  id: z.uuid().optional(),
  categoryId: z.uuid(),
  price: z.number().int().min(0).max(10_000_000),
  names: perLocale(120).refine((n) => n.hy.length > 0, { path: ["hy"], message: "name_required" }),
  descriptions: perLocale(600),
  prepAreaId: z.uuid().nullable(),
  tags: z.array(z.enum(DISH_TAGS)).max(DISH_TAGS.length),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
  // The owner has reviewed the allergens; with an empty list this says "none" (ADR-083). Undefined keeps the stored value.
  allergensConfirmed: z.boolean().optional(),
  modifierGroupIds: z.array(z.uuid()).max(20),
  markReviewed: z.boolean(),
  // Undefined leaves the flag as it is.
  isActive: z.boolean().optional(),
  // Owner only; null clears it, undefined leaves it as it is.
  cost: z.number().int().min(0).max(10_000_000).nullable().optional(),
});
export type DishInput = z.infer<typeof dishInput>;

export const categoryInput = z.object({
  id: z.uuid().optional(),
  names: perLocale(80).refine((n) => n.hy.length > 0, { path: ["hy"], message: "name_required" }),
  prepAreaId: z.uuid().nullable(),
  /** Left out: keep the stored value. */
  isActive: z.boolean().optional(),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export const optionGroupInput = z.object({
  id: z.uuid().optional(),
  names: perLocale(80).refine((n) => n.hy.length > 0, { path: ["hy"], message: "name_required" }),
  required: z.boolean(),
  options: z
    .array(
      z.object({
        id: z.uuid().optional(),
        names: perLocale(80).refine((n) => n.hy.length > 0, { path: ["hy"], message: "name_required" }),
        priceDelta: z.number().int().min(-1_000_000).max(1_000_000),
        isDefault: z.boolean(),
      }),
    )
    .min(1)
    .max(30),
});
export type OptionGroupInput = z.infer<typeof optionGroupInput>;
