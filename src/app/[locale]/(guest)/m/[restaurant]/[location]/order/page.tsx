import type { Metadata, Viewport } from "next";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { parseBrand, wordmarkTones } from "@/features/guest-theme/brand";
import { GuestThemeScope } from "@/features/guest-theme/guest-theme-scope";
import { guestTheme, themeColor } from "@/features/guest-theme/themes";
import { GuestHeader } from "@/features/menu/guest-menu/guest-header";
import { getMenuHints, getPublicMenu } from "@/features/menu/guest-menu/load.server";
import { dishNames, sameNameDetails, wordmarkOf } from "@/features/menu/guest-menu/view-model";
import { Notice, dishPhotoUrl } from "@/features/menu/guest-menu/ui";
import { GuestI18nProvider, type GuestMessages } from "@/features/ordering/guest-i18n-context";
import { OrderStatusView } from "@/features/ordering/order-status-view";
import { resolveTable } from "@/features/ordering/resolve-table.server";
import { routing, type Locale } from "@/i18n/routing";
import { vapidPublicKeyOrNull } from "@/lib/env.server";

type Params = Promise<{ locale: string; restaurant: string; location: string }>;
type Search = Promise<{ t?: string | string[] }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "guest.cart" });
  return { title: t("title") };
}

// The café's look (ADR-052) comes with its published menu; without one, the default.
const lookOf = (restaurant: string, location: string) =>
  getPublicMenu(restaurant, location)
    .then((m) => m?.restaurant ?? null)
    .catch(() => null);

export async function generateViewport({ params }: { params: Params }): Promise<Viewport> {
  const { restaurant, location } = await params;
  return { themeColor: themeColor(guestTheme((await lookOf(restaurant, location))?.guest_theme)) };
}

// Order status: /{locale}/m/{café}/{location}/order?t=<token>. The token
// names the table; the guest's orders are read in the browser with the
// guest's own session (RLS), so this page holds no guest data on the server.
export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { locale, restaurant, location } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const token = first((await searchParams).t);
  const [resolved, look, hints, published] = await Promise.all([
    token ? resolveTable(token) : null,
    lookOf(restaurant, location),
    getMenuHints(restaurant, location),
    getPublicMenu(restaurant, location).catch(() => null),
  ]);
  const busy = Boolean(published?.kitchen_busy);
  const table =
    resolved && resolved.restaurant_slug === restaurant && resolved.location_slug === location
      ? resolved
      : null;
  const query = token ? `?t=${encodeURIComponent(token)}` : "";
  const menuHref = `/${locale}/m/${restaurant}/${location}${query}`;
  const languages = (table?.guest_locales ?? []).flatMap((l) =>
    routing.locales.includes(l as Locale)
      ? [{ locale: l as Locale, href: `/${l}/m/${restaurant}/${location}/order${query}` }]
      : [],
  );
  const t = await getTranslations({ locale, namespace: "guest" });
  // The public key goes to the phone for «Notify me when it's ready» (ADR-049).
  const vapidPublicKey = vapidPublicKeyOrNull(process.env);
  const theme = guestTheme(look?.guest_theme);
  // The wordmark that reads on the header band's colour (ADR-065).
  const wordmark = wordmarkOf(look?.brand, wordmarkTones(theme, parseBrand(look?.brand)).header);

  return (
    <GuestThemeScope theme={theme} brandColor={look?.brand_color} brand={look?.brand}>
      {table ? (
        <GuestI18nProvider locale={locale} messages={(await getMessages()).guest as GuestMessages}>
          <GuestHeader
            cafeName={table.restaurant_name}
            logoUrl={look?.logo ? dishPhotoUrl(look.logo) : null}
            wordmarkUrl={wordmark ? dishPhotoUrl(wordmark) : null}
            tableLabel={table.table_label}
            languages={languages}
            // A short bar: the order starts near the top of the screen.
            compact
          />
          <OrderStatusView
            tableId={table.table_id}
            menuHref={menuHref}
            vapidPublicKey={vapidPublicKey}
            // The kitchen's own "busy" wait wins over the usual one.
            wait={busy ? null : hints.wait}
            // Two dishes with one name (blini with jam, blini with caviar) are told apart.
            details={published ? sameNameDetails(published, locale) : undefined}
            // When the kitchen can't make a dish, similar ones are offered (ADR-081).
            dishes={published ? dishNames(published, locale) : undefined}
          />
        </GuestI18nProvider>
      ) : (
        <main className="mx-auto grid w-full max-w-[720px] gap-4 px-4 py-10 md:px-8">
          <Notice tone={token ? "alert" : "info"}>{token ? t("menu.badTable") : t("menu.noTable")}</Notice>
          <a href={menuHref} className="text-accent-text inline-flex min-h-12 items-center font-semibold">
            {t("order.toMenu")}
          </a>
        </main>
      )}
    </GuestThemeScope>
  );
}
