import { z } from "zod";

export const DISH_TAGS = ["popular", "new", "vegan", "spicy"] as const;

// Owners type prices as "2500", "2 500" or "2 500 ֏". Whole drams only.
export function parsePriceInput(raw: string): number | null {
  const compact = raw.replace(/[\s ֏]/g, "");
  if (!/^\d{1,8}$/.test(compact)) return null;
  return Number(compact);
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
  modifierGroupIds: z.array(z.uuid()).max(20),
  markReviewed: z.boolean(),
});
export type DishInput = z.infer<typeof dishInput>;

export const categoryInput = z.object({
  id: z.uuid().optional(),
  names: perLocale(80).refine((n) => n.hy.length > 0, { path: ["hy"], message: "name_required" }),
  prepAreaId: z.uuid().nullable(),
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
