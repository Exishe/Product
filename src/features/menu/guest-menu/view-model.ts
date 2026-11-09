import type { Locale } from "@/i18n/routing";
import { normalizeForSearch } from "@/lib/format/search";

// The shape of api.public_menu (published snapshot from api.publish_menu,
// plus today's stop list and the kitchen-busy notice).
type I18n = Partial<Record<string, string | null>> | null;
type SnapshotModifier = { id: string; price_delta: number; is_default: boolean; name: I18n };
type SnapshotGroup = { id: string; min: number; max: number; name: I18n; modifiers: SnapshotModifier[] | null };
type SnapshotItem = {
  name: I18n;
  description: I18n;
  price: number;
  portion: { amount: number; unit: string } | null;
  tags: string[] | null;
  groups: SnapshotGroup[] | null;
};
export type PublicMenu = {
  restaurant: { name: string };
  location: { id: string; name: string; locales: string[]; ordering: boolean };
  menu: {
    menus: { id: string; name: I18n; categories: { id: string; name: I18n; item_ids: string[] }[] | null }[] | null;
    items: Record<string, SnapshotItem>;
  };
  sold_out: string[] | null;
  kitchen_busy: { until: string; expected_wait_minutes: number | null } | null;
};

/** A piece of menu text and the language it is actually in. */
export type Text = { text: string; lang: Locale };
export type GuestModifier = { id: string; name: Text; delta: number; isDefault: boolean };
export type GuestGroup = { id: string; min: number; max: number; name: Text | null; modifiers: GuestModifier[] };
export type GuestItem = {
  id: string;
  name: Text;
  description: Text | null;
  price: number;
  portion: { amount: number; unit: "g" | "ml" | "pcs" } | null;
  tags: GuestTag[];
  soldOut: boolean;
  groups: GuestGroup[];
  /** Every language's name, normalized for cross-script search (one per line). */
  search: string;
};
export type GuestCategory = { id: string; name: Text | null; items: GuestItem[] };
export type GuestMenuData = {
  restaurantName: string;
  locationId: string;
  locales: string[];
  ordering: boolean;
  kitchenBusy: { minutes: number | null } | null;
  categories: GuestCategory[];
};

const TAGS = ["vegan", "spicy", "new", "popular"] as const;
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
      soldOut: soldOut.has(id),
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
      return items.length ? [{ id: c.id, name: localized(c.name, locale), items }] : [];
    }),
  );

  return {
    restaurantName: data.restaurant.name,
    locationId: data.location.id,
    locales: data.location.locales,
    ordering: data.location.ordering,
    kitchenBusy: data.kitchen_busy ? { minutes: data.kitchen_busy.expected_wait_minutes } : null,
    categories,
  };
}
