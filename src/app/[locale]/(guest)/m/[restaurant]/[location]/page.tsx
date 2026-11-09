import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { GuestHeader } from "@/features/menu/guest-menu/guest-header";
import { GuestMenu, type TableState } from "@/features/menu/guest-menu/guest-menu";
import { getPublicMenu } from "@/features/menu/guest-menu/load.server";
import { buildGuestMenu } from "@/features/menu/guest-menu/view-model";
import { GuestI18nProvider, type GuestMessages } from "@/features/ordering/guest-i18n-context";
import { resolveTable } from "@/features/ordering/resolve-table.server";
import { routing, type Locale } from "@/i18n/routing";

type Params = Promise<{ locale: string; restaurant: string; location: string }>;
type Search = Promise<{ t?: string | string[] }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { restaurant, location } = await params;
  const menu = await getPublicMenu(restaurant, location).catch(() => null);
  return { title: menu?.restaurant.name ?? "Pativ" };
}

// The guest menu: server-rendered from the published snapshot, so it shows at
// once; the cart, dish sheet and search run in the browser. The table token
// (?t=) comes from the QR and is checked again here: a token of another café
// or an old sticker turns ordering off with a notice, the menu still shows.
export default async function GuestMenuPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale, restaurant, location } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const token = first((await searchParams).t);

  const [published, resolved] = await Promise.all([getPublicMenu(restaurant, location), token ? resolveTable(token) : null]);
  const atThisCafe = resolved !== null && resolved.restaurant_slug === restaurant && resolved.location_slug === location;
  const table: TableState =
    !token ? { kind: "none" } : atThisCafe && resolved ? { kind: "ok", id: resolved.table_id, label: resolved.table_label, token } : { kind: "invalid" };

  const hrefFor = (l: Locale) => `/${l}/m/${restaurant}/${location}${token ? `?t=${encodeURIComponent(token)}` : ""}`;

  if (!published) {
    // A valid sticker of a café that hasn't published its menu yet.
    if (!atThisCafe || !resolved) notFound();
    const t = await getTranslations({ locale, namespace: "guest.menu" });
    return (
      <div className="min-h-dvh bg-mist">
        <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-matsoni">
          <GuestHeader locale={locale} cafeName={resolved.restaurant_name} tableLabel={resolved.table_label} locales={resolved.guest_locales} hrefFor={hrefFor} />
          <p className="px-4 py-12 text-center text-xl text-muted">{t("notPublished")}</p>
        </div>
      </div>
    );
  }

  const menu = buildGuestMenu(published, locale);
  const messages = (await getMessages()).guest as GuestMessages;
  return (
    <div className="min-h-dvh bg-mist">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-matsoni">
        <GuestHeader
          locale={locale}
          cafeName={menu.restaurantName}
          tableLabel={table.kind === "ok" ? table.label : null}
          locales={menu.locales}
          hrefFor={hrefFor}
        />
        <GuestI18nProvider locale={locale} messages={messages}>
          <GuestMenu menu={menu} table={table} />
        </GuestI18nProvider>
      </div>
    </div>
  );
}
