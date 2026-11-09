import { pickGuestLocale } from "@/lib/i18n/pick-locale";
import { isWellFormedToken } from "@/lib/security/table-token";

// What api.resolve_table_token returns for a valid sticker.
export type ResolvedTable = {
  restaurant_slug: string;
  restaurant_name: string;
  location_slug: string;
  location_id: string;
  table_id: string;
  table_label: string;
  guest_locales: string[];
  default_locale: string;
};

export type TableEntry = { kind: "menu"; href: string } | { kind: "invalid" };

const SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/;

// The QR entry (/t/<token>): a malformed token never reaches the database;
// a valid one leads to the café's menu in the guest's language, with the
// token in the URL for the guest's later writes. `resolve` returns null for
// anything the database refuses (old sticker, forged or unknown token).
export async function resolveTableEntry(
  token: string,
  visitor: { acceptLanguage: string | null; chosenLocale?: string | null },
  resolve: (token: string) => Promise<ResolvedTable | null>,
): Promise<TableEntry> {
  if (!isWellFormedToken(token)) return { kind: "invalid" };
  const table = await resolve(token);
  if (!table || !SLUG.test(table.restaurant_slug) || !SLUG.test(table.location_slug)) return { kind: "invalid" };
  const locale = pickGuestLocale({
    chosen: visitor.chosenLocale,
    acceptLanguage: visitor.acceptLanguage,
    offered: table.guest_locales,
    fallback: table.default_locale,
  });
  return { kind: "menu", href: `/${locale}/m/${table.restaurant_slug}/${table.location_slug}?t=${token}` };
}
