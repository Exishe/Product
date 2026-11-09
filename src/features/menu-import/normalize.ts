import { parsePrice } from "./parse-price.ts";
import type { AiMenu, DraftItem, MenuDraft } from "./schema.ts";

// The model's reading, checked against our own price parser. Where the two
// disagree, or a name is missing, the dish drops below LOW_CONFIDENCE so the
// review screen points the owner at it. Nothing here guesses a price.

function checkPrice(priceAmd: number | null, priceText: string): { price: number | null; doubt: number } {
  const parsed = parsePrice(priceText);
  if (parsed !== null && priceAmd !== null && parsed !== priceAmd) return { price: parsed, doubt: 0.3 };
  if (parsed !== null) return { price: parsed, doubt: 1 };
  if (priceAmd !== null) return { price: priceAmd, doubt: 0.5 };
  return { price: null, doubt: 0 };
}

export function normalizeDraft(menu: AiMenu): MenuDraft {
  const categories = menu.categories
    .map((category) => ({
      names: category.names,
      items: category.items.map((item): DraftItem => {
        const base = checkPrice(item.price_amd, item.price_text);
        const checked = item.variants.map((v) => checkPrice(v.price_amd, v.price_text));
        const variants = item.variants.map((v, i) => ({ ...v, price_amd: checked[i]?.price ?? null }));
        const doubts = [base.doubt, ...checked.map((c) => c.doubt), item.names.hy === "" ? 0.3 : 1];
        // A dish with sizes but no single price starts at its cheapest size.
        const cheapest = Math.min(...variants.map((v) => v.price_amd ?? Infinity));
        const price = base.price ?? (Number.isFinite(cheapest) ? cheapest : null);
        return {
          names: item.names,
          descriptions: item.descriptions,
          price_amd: price,
          price_text: item.price_text,
          confidence: Math.min(item.confidence, ...doubts),
          variants,
          reviewed: false,
        };
      }),
    }))
    .filter((category) => category.items.length > 0);

  return { source_locale: menu.source_locale, categories };
}
