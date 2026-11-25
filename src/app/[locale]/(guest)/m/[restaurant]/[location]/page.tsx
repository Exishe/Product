import type { Metadata, Viewport } from "next";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { parseBrand, wordmarkTones } from "@/features/guest-theme/brand";
import { GuestThemeScope } from "@/features/guest-theme/guest-theme-scope";
import { DEFAULT_THEME, guestTheme, themeColor } from "@/features/guest-theme/themes";
import { GuestBusy } from "@/features/menu/guest-menu/guest-busy";
import { GuestHeader, type LanguageLink } from "@/features/menu/guest-menu/guest-header";
import { GuestMenu, type TableState } from "@/features/menu/guest-menu/guest-menu";
import { PromoBanners } from "@/features/menu/guest-menu/promo-banner";
import { getMenuHints, getPublicMenu } from "@/features/menu/guest-menu/load.server";
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

// The browser bar wears the café's page colour.
export async function generateViewport({ params }: { params: Params }): Promise<Viewport> {
  const { restaurant, location } = await params;
  const menu = await getPublicMenu(restaurant, location).catch(() => null);
  return { themeColor: themeColor(guestTheme(menu?.restaurant.guest_theme)) };
}

// The guest menu: server-rendered from the published snapshot, so it shows at
// once; the cart, dish sheet and search run in the browser. The table token
// (?t=) comes from the QR and is checked again here: a token of another café
// or an old sticker turns ordering off with a notice, the menu still shows.
// The café's theme and brand colour (ADR-052) wrap the whole page.
export default async function GuestMenuPage({
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

  const [published, resolved, hints] = await Promise.all([
    getPublicMenu(restaurant, location).catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      return "unavailable" as const;
    }),
    token ? resolveTable(token) : null,
    getMenuHints(restaurant, location),
  ]);
  const atThisCafe =
    resolved !== null && resolved.restaurant_slug === restaurant && resolved.location_slug === location;
  const table: TableState = !token
    ? { kind: "none" }
    : atThisCafe && resolved
      ? { kind: "ok", id: resolved.table_id, label: resolved.table_label, token }
      : { kind: "invalid" };

  const languagesFor = (offered: readonly string[]): LanguageLink[] =>
    routing.locales
      .filter((l) => offered.includes(l))
      .map((l: Locale) => ({
        locale: l,
        href: `/${l}/m/${restaurant}/${location}${token ? `?t=${encodeURIComponent(token)}` : ""}`,
      }));
  const messages = (await getMessages()).guest as GuestMessages;

  // The database could not answer even after retries: a calm page that tries
  // again by itself, never an error screen (ADR-089).
  if (published === "unavailable") {
    const t = await getTranslations({ locale, namespace: "guest.entry" });
    return <GuestBusy title={t("busyTitle")} body={t("busyBody")} retry={t("retry")} />;
  }

  if (!published) {
    // A valid sticker of a café that hasn't published its menu yet.
    if (!atThisCafe || !resolved) notFound();
    const t = await getTranslations({ locale, namespace: "guest.menu" });
    return (
      <GuestThemeScope theme={DEFAULT_THEME}>
        <GuestI18nProvider locale={locale} messages={messages}>
          <GuestHeader
            cafeName={resolved.restaurant_name}
            logoUrl={null}
            tableLabel={resolved.table_label}
            languages={languagesFor(resolved.guest_locales)}
          />
          <p className="text-muted px-4 py-12 text-center text-xl">{t("notPublished")}</p>
        </GuestI18nProvider>
      </GuestThemeScope>
    );
  }

  // Which wordmark each bar shows depends on the colour behind it (ADR-065).
  const theme = guestTheme(published.restaurant.guest_theme);
  const menu = buildGuestMenu(
    published,
    locale,
    wordmarkTones(theme, parseBrand(published.restaurant.brand)),
  );
  const promoText = menu.promos.length ? await getTranslations({ locale, namespace: "guest.menu" }) : null;
  return (
    <GuestThemeScope theme={menu.theme} brandColor={menu.brandColor} brand={published.restaurant.brand}>
      <GuestI18nProvider locale={locale} messages={messages}>
        <GuestMenu
          menu={menu}
          table={table}
          languages={languagesFor(menu.locales)}
          hints={hints}
          promoBanners={
            promoText && (
              <PromoBanners
                promos={menu.promos}
                locale={locale}
                label={promoText("promoLabel")}
                closeLabel={promoText("promoClose")}
              />
            )
          }
          orderHref={
            table.kind === "ok"
              ? `/${locale}/m/${restaurant}/${location}/order?t=${encodeURIComponent(table.token)}`
              : null
          }
        />
      </GuestI18nProvider>
    </GuestThemeScope>
  );
}
