import { guestTheme, type GuestTheme } from "@/features/guest-theme/themes";
import type { Locale } from "@/i18n/routing";
import { parseStatus, type MenuStatus } from "@/features/availability/status";
import { normalizeForSearch } from "@/lib/format/search";
import { parseSubstitutions, type SubInfo } from "@/features/ordering/substitutions-parse";
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
    /**
     * The brand profile (ADR-058); missing until migration 20261119100000_brand_profile,
     * and without `wordmark_dark` until 20261119203419_brand_wordmark_dark (ADR-065).
     */
    brand?: unknown;
  };
  location: {
    id: string;
    name: string;
    locales: string[];
    ordering: boolean;
    /** ADR-068; missing until migration 20261123120000_availability_controls. */
    paused?: { until: string | null } | null;
    closed?: { until: string | null } | null;
  };
  /** Categories outside their daily window right now (ADR-068). */
  hidden_categories?: string[] | null;
  menu: {
    version?: number;
    menus:
      | { id: string; name: I18n; categories: { id: string; name: I18n; item_ids: string[] }[] | null }[]
      | null;
    items: Record<string, SnapshotItem>;
  };
  sold_out: string[] | null;
  /** Section cover photos by category id (ADR-058). */
  covers?: Record<string, string> | null;
  kitchen_busy: { until: string; expected_wait_minutes: number | null } | null;
  /** Live promos (ADR-070); missing until migration 20261123165000_promos. */
  promos?: unknown;
  /**
   * Dishes made with a replacement today, by dish id (ADR-076; missing until
   * migration 20261123250000_ingredients_substitutes); their `price` already
   * includes the difference.
   */
  substitutions?: unknown;
  outages?: unknown;
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
  /** Made with a replacement ingredient today (ADR-076); the price already includes the difference. */
  substitution: SubInfo | null;
  groups: GuestGroup[];
  /** Storage path of the dish photo in the menu-images bucket. */
  image: string | null;
  /** Every language's name, normalized for cross-script search (one per line). */
  search: string;
  /** A wine's grape and region, when its description is that and nothing else. */
  origin: { grape: string; region: string } | null;
};
export type GuestCategory = {
  id: string;
  name: Text | null;
  items: GuestItem[];
  /** Storage path of the section's cover photo (ADR-058). */
  cover: string | null;
  /** Every language's section name, normalized like a dish's. */
  search: string;
};
export type GuestPromo = { id: string; title: Text; text: Text | null; badge: string | null };
export type GuestMenuData = {
  restaurantName: string;
  /** The café's guest theme preset (ADR-052). */
  theme: GuestTheme;
  brandColor: string | null;
  /** Storage path of the café's logo in the menu-images bucket. */
  logo: string | null;
  /** Storage path of the café's wordmark for the header band, from the brand. */
  wordmark: string | null;
  /** The wordmark for the slim bar, which sits on the page colour (ADR-065). */
  wordmarkBar: string | null;
  locationId: string;
  locales: string[];
  ordering: boolean;
  /** Ordering is paused for now; `until` is null when it lasts until the café resumes (ADR-068). */
  paused: { until: string | null } | null;
  /** The kitchen is closed for today; `until` is the next opening. */
  closed: { until: string | null } | null;
  /** The same facts as api.public_menu_status, to tell when the page is out of date. */
  status: MenuStatus;
  kitchenBusy: { minutes: number | null } | null;
  /** The banners to show: promos that are on right now, in the page's language (ADR-070). */
  promos: GuestPromo[];
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

// A wine card's second line. Importers and owners write it the way the
// printed list does, «Sauvignon Blanc / Loire Valley, France», the same in
// every language; a translated description («with honey / jam») is a
// dish's, and stays a description.
export function originOf(description: I18n): GuestItem["origin"] {
  const texts = Object.values(description ?? {}).flatMap((d) => (d?.trim() ? [d.trim()] : []));
  const first = texts[0];
  if (texts.length < 2 || !first || texts.some((d) => d !== first)) return null;
  const parts = first.split(" / ");
  const [grape, region] = parts;
  return parts.length === 2 && grape && region && region.includes(",") ? { grape, region } : null;
}

/** The sizes of a dish sold in two or three (glass and bottle), each with its full price. */
export function sizesOf(
  item: Pick<GuestItem, "price" | "groups">,
): { id: string; name: Text; price: number }[] {
  const required = item.groups.filter((g) => g.min > 0);
  const [g] = required;
  if (!g || required.length !== 1 || g.min !== 1 || g.max !== 1) return [];
  if (g.modifiers.length < 2 || g.modifiers.length > 3 || g.modifiers.every((m) => m.delta === 0)) return [];
  return g.modifiers.map((m) => ({ id: m.id, name: m.name, price: item.price + m.delta }));
}

/** Dishes that share their name with another one: the cart tells them apart by description. */
export function sameNamed(categories: readonly GuestCategory[]): Set<string> {
  const byName = new Map<string, string[]>();
  for (const c of categories)
    for (const i of c.items) byName.set(i.name.text, [...(byName.get(i.name.text) ?? []), i.id]);
  return new Set([...byName.values()].filter((ids) => ids.length > 1).flat());
}

/**
 * For the order status page, which shows the names the order was placed
 * with: the description of every dish that shares its name with another, by
 * dish id, in the page's language.
 */
export function sameNameDetails(data: PublicMenu, locale: Locale): Record<string, string> {
  const byName = new Map<string, string[]>();
  for (const [id, raw] of Object.entries(data.menu.items)) {
    const name = localized(raw.name, locale)?.text;
    if (name) byName.set(name, [...(byName.get(name) ?? []), id]);
  }
  const out: Record<string, string> = {};
  for (const ids of byName.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const text = localized(data.menu.items[id]?.description ?? null, locale)?.text;
      if (text) out[id] = text;
    }
  }
  return out;
}

/**
 * What the order page needs to offer a replacement dish (ADR-080): the name in
 * the page's language and the price, by dish id. Ids only come from the database's
 * answer, so a long menu costs nothing until a dish can't be made.
 */
export function dishNames(data: PublicMenu, locale: Locale): Record<string, { name: string; price: number }> {
  const out: Record<string, { name: string; price: number }> = {};
  for (const [id, raw] of Object.entries(data.menu.items)) {
    const name = localized(raw.name, locale)?.text;
    if (name) out[id] = { name, price: raw.price };
  }
  return out;
}

/** Is the background behind the wordmark dark? Worked out on the server (wordmarkTones in brand.ts). */
export type WordmarkTones = { header: boolean; page: boolean };

// Only the wordmark paths are needed here; the rest of the brand is parsed by
// GuestThemeScope on the server (brand.ts stays out of the client bundle).
// `wordmark` is drawn for light backgrounds, `wordmark_dark` for dark ones
// (ADR-065); a café with only one of them gets that one everywhere.
export function wordmarkOf(brand: unknown, onDark = false): string | null {
  const b = brand && typeof brand === "object" ? (brand as Record<string, unknown>) : {};
  const path = (v: unknown) => (typeof v === "string" && v ? v : null);
  const [light, dark] = [path(b.wordmark), path(b.wordmark_dark)];
  return onDark ? (dark ?? light) : (light ?? dark);
}

export function buildGuestMenu(
  data: PublicMenu,
  locale: Locale,
  dark: WordmarkTones = { header: false, page: false },
): GuestMenuData {
  const soldOut = new Set(data.sold_out ?? []);
  const subs = parseSubstitutions(data.substitutions, locale);
  const hidden = new Set(data.hidden_categories ?? []);
  const item = (id: string): GuestItem | null => {
    const raw = data.menu.items[id];
    const name = raw && localized(raw.name, locale);
    if (!raw || !name) return null;
    const unit = UNITS.find((u) => u === raw.portion?.unit);
    const origin = originOf(raw.description);
    return {
      id,
      name,
      description: localized(raw.description, locale),
      price: raw.price,
      portion: raw.portion && unit ? { amount: raw.portion.amount, unit } : null,
      tags: TAGS.filter((t) => raw.tags?.includes(t)),
      allergens: ALLERGENS.filter((a) => raw.allergens?.includes(a)),
      soldOut: soldOut.has(id),
      substitution: subs[id] ?? null,
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
      // A wine is also found by its grape or region («Malbec», «Bordeaux»).
      search: origin
        ? `${searchKey(raw.name)}\n${normalizeForSearch(`${origin.grape} ${origin.region}`)}`
        : searchKey(raw.name),
      origin,
    };
  };

  const categories = (data.menu.menus ?? []).flatMap((m) =>
    (m.categories ?? []).flatMap((c) => {
      if (hidden.has(c.id)) return [];
      const items = c.item_ids.map(item).filter((i): i is GuestItem => i !== null);
      const cover = data.covers?.[c.id];
      return items.length
        ? [
            {
              id: c.id,
              name: localized(c.name, locale),
              items,
              cover: typeof cover === "string" && cover ? cover : null,
              search: searchKey(c.name),
            },
          ]
        : [];
    }),
  );

  const status = parseStatus(
    {
      version: data.menu.version,
      ordering: data.location.ordering,
      paused: data.location.paused,
      closed: data.location.closed,
      sold_out: data.sold_out,
      hidden_categories: data.hidden_categories,
      kitchen_busy: data.kitchen_busy,
      promos: data.promos,
      outages: data.outages,
    },
    null,
  ) as MenuStatus;

  return {
    restaurantName: data.restaurant.name,
    theme: guestTheme(data.restaurant.guest_theme),
    brandColor: data.restaurant.brand_color ?? null,
    logo: data.restaurant.logo || null,
    wordmark: wordmarkOf(data.restaurant.brand, dark.header),
    wordmarkBar: wordmarkOf(data.restaurant.brand, dark.page),
    locationId: data.location.id,
    locales: data.location.locales,
    ordering: data.location.ordering,
    paused: data.location.paused ?? null,
    closed: data.location.closed ?? null,
    status,
    promos: status.promos.flatMap((p) => {
      const title = localized(p.title, locale);
      return title ? [{ id: p.id, title, text: localized(p.text, locale), badge: p.badge }] : [];
    }),
    kitchenBusy: data.kitchen_busy ? { minutes: data.kitchen_busy.expected_wait_minutes } : null,
    hasAllergens: categories.some((c) => c.items.some((i) => i.allergens.length > 0)),
    categories,
  };
}
