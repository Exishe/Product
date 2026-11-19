import { guestTheme, type GuestTheme } from "@/features/guest-theme/themes";
import type { Locale } from "@/i18n/routing";
import { normalizeForSearch } from "@/lib/format/search";
import { ALLERGENS, type Allergen } from "./allergens";

// The shape of api.public_menu (published snapshot from api.publish_menu,
// plus today's stop list and the kitchen-busy notice).
type I18n = Partial<Record<string, string | null>> | null;
type SnapshotModifier = { id: string; price_delta: number; is_default: boolean; name: I18n };
type SnapshotGroup = {
  id: string;
  min: number;
  max: number;
  name: I18n;
  modifiers: SnapshotModifier[] | null;
};
type SnapshotItem = {
  name: I18n;
  description: I18n;
  price: number;
  portion: { amount: number; unit: string } | null;
  tags: string[] | null;
  allergens?: string[] | null;
  groups: SnapshotGroup[] | null;
  image?: string | null;
};
export type PublicMenu = {
  restaurant: {
    name: string;
    logo?: string | null;
    brand_color?: string | null;
    /** Missing until migration 20261117120000_guest_theme is applied. */
    guest_theme?: string | null;
    /** The brand profile (ADR-057); missing until migration 20261119100000_brand_profile. */
    brand?: unknown;
  };
  location: { id: string; name: string; locales: string[]; ordering: boolean };
  menu: {
    menus:
      | { id: string; name: I18n; categories: { id: string; name: I18n; item_ids: string[] }[] | null }[]
      | null;
    items: Record<string, SnapshotItem>;
  };
  sold_out: string[] | null;
  /** Section cover photos by category id (ADR-057). */
  covers?: Record<string, string> | null;
  kitchen_busy: { until: string; expected_wait_minutes: number | null } | null;
};

/** A piece of menu text and the language it is actually in. */
export type Text = { text: string; lang: Locale };
export type GuestModifier = { id: string; name: Text; delta: number; isDefault: boolean };
export type GuestGroup = {
  id: string;
  min: number;
  max: number;
  name: Text | null;
  modifiers: GuestModifier[];
};
export type GuestItem = {
  id: string;
  name: Text;
  description: Text | null;
  price: number;
  portion: { amount: number; unit: "g" | "ml" | "pcs" } | null;
  tags: GuestTag[];
  /** EU allergen codes the café listed; empty means "not listed", not "none". */
  allergens: Allergen[];
  soldOut: boolean;
  groups: GuestGroup[];
  /** Storage path of the dish photo in the menu-images bucket. */
  image: string | null;
  /** Every language's name, normalized for cross-script search (one per line). */
  search: string;
};
export type GuestCategory = {
  id: string;
  name: Text | null;
  items: GuestItem[];
  /** Storage path of the section's cover photo (ADR-057). */
  cover: string | null;
};
export type GuestMenuData = {
  restaurantName: string;
  /** The café's guest theme preset (ADR-052). */
  theme: GuestTheme;
  brandColor: string | null;
  /** Storage path of the café's logo in the menu-images bucket. */
  logo: string | null;
  /** Storage path of the café's wordmark, from the brand. */
  wordmark: string | null;
  locationId: string;
  locales: string[];
  ordering: boolean;
  kitchenBusy: { minutes: number | null } | null;
  /** Some dish lists its allergens: the "I avoid…" filter is worth offering. */
  hasAllergens: boolean;
  categories: GuestCategory[];
};

// Diet tags first (they answer "can I eat this?"), then the café's own notes.
const TAGS = ["vegan", "vegetarian", "gluten_free", "lactose_free", "spicy", "new", "popular"] as const;
export type GuestTag = (typeof TAGS)[number];
const UNITS = ["g", "ml", "pcs"] as const;

// Requested language first; a missing translation falls back visibly to
// Armenian, then Russian, then English (Review focus 5). The caller marks
// the text with `lang` when it isn't the page's language.
const FALLBACK: Locale[] = ["hy", "ru", "en"];

export function localized(names: I18n, locale: Locale): Text | null {
  if (!names) return null;
  for (const lang of [locale, ...FALLBACK.filter((l) => l !== locale)]) {
    const text = names[lang]?.trim();
    if (text) return { text, lang };
  }
  return null;
}

function searchKey(names: I18n): string {
  return Object.values(names ?? {})
    .filter((n): n is string => Boolean(n?.trim()))
    .map(normalizeForSearch)
    .join("\n");
}

// Only the wordmark path is needed here; the rest of the brand is parsed by
// GuestThemeScope on the server (brand.ts stays out of the client bundle).
export function wordmarkOf(brand: unknown): string | null {
  const w = brand && typeof brand === "object" ? (brand as { wordmark?: unknown }).wordmark : null;
  return typeof w === "string" && w ? w : null;
}

export function buildGuestMenu(data: PublicMenu, locale: Locale): GuestMenuData {
  const soldOut = new Set(data.sold_out ?? []);
  const item = (id: string): GuestItem | null => {
    const raw = data.menu.items[id];
    const name = raw && localized(raw.name, locale);
    if (!raw || !name) return null;
    const unit = UNITS.find((u) => u === raw.portion?.unit);
    return {
      id,
      name,
      description: localized(raw.description, locale),
      price: raw.price,
      portion: raw.portion && unit ? { amount: raw.portion.amount, unit } : null,
      tags: TAGS.filter((t) => raw.tags?.includes(t)),
      allergens: ALLERGENS.filter((a) => raw.allergens?.includes(a)),
      soldOut: soldOut.has(id),
      image: typeof raw.image === "string" && raw.image ? raw.image : null,
      groups: (raw.groups ?? []).map((g) => ({
        id: g.id,
        min: g.min,
        max: g.max,
        name: localized(g.name, locale),
        modifiers: (g.modifiers ?? []).flatMap((m) => {
          const mName = localized(m.name, locale);
          return mName ? [{ id: m.id, name: mName, delta: m.price_delta, isDefault: m.is_default }] : [];
        }),
      })),
      search: searchKey(raw.name),
    };
  };

  const categories = (data.menu.menus ?? []).flatMap((m) =>
    (m.categories ?? []).flatMap((c) => {
      const items = c.item_ids.map(item).filter((i): i is GuestItem => i !== null);
      const cover = data.covers?.[c.id];
      return items.length
        ? [
            {
              id: c.id,
              name: localized(c.name, locale),
              items,
              cover: typeof cover === "string" && cover ? cover : null,
            },
          ]
        : [];
    }),
  );

  return {
    restaurantName: data.restaurant.name,
    theme: guestTheme(data.restaurant.guest_theme),
    brandColor: data.restaurant.brand_color ?? null,
    logo: data.restaurant.logo || null,
    wordmark: wordmarkOf(data.restaurant.brand),
    locationId: data.location.id,
    locales: data.location.locales,
    ordering: data.location.ordering,
    kitchenBusy: data.kitchen_busy ? { minutes: data.kitchen_busy.expected_wait_minutes } : null,
    hasAllergens: categories.some((c) => c.items.some((i) => i.allergens.length > 0)),
    categories,
  };
}
