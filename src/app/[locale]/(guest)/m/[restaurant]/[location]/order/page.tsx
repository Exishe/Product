import type { Metadata, Viewport } from "next";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { parseBrand, wordmarkTones } from "@/features/guest-theme/brand";
import { isDemoCafe } from "@/features/guest-theme/demo";
import { GuestThemeScope } from "@/features/guest-theme/guest-theme-scope";
import { guestTheme, themeColor } from "@/features/guest-theme/themes";
import { getMenuHints, getPublicMenu } from "@/features/menu/guest-menu/load.server";
import { buildGuestMenu, dishNames, sameNameDetails, wordmarkOf } from "@/features/menu/guest-menu/view-model";
import { QrCode } from "lucide-react";
import guestStyles from "@/features/menu/guest-menu/guest.module.css";
import { GuestHeader } from "@/features/menu/guest-menu/guest-header";
import { Notice, dishPhotoUrl } from "@/features/menu/guest-menu/ui";
import { GuestI18nProvider, type GuestCatalog, type GuestMessages } from "@/features/ordering/guest-i18n-context";
import { LocalizedOrderPage, type OrderTexts } from "@/features/ordering/localized-order-page";
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
  // The wordmark that reads on the page colour: the bar has no band behind it (ADR-065).
  const wordmark = wordmarkOf(look?.brand, wordmarkTones(theme, parseBrand(look?.brand)).page);

  // Dishes to recommend while the order cooks: the café's own pairs first (the
  // browser picks those that go with this table's order), then dishes with a photo.
  // Prepared in every offered language, so a switch on the page needs no
  // request and keeps the order view as it is (ADR-092).
  const paired = new Set(Object.values(hints.pairs).flat());
  const tones = wordmarkTones(theme, parseBrand(look?.brand));
  const textsIn = (l: Locale): OrderTexts => {
    if (!published) return { dishes: [], details: undefined, cantMakeDishes: undefined };
    const dishes = buildGuestMenu(published, l, tones)
      .categories.flatMap((c) => c.items)
      .filter((i) => !i.soldOut);
    const recommend = [
      ...dishes.filter((i) => paired.has(i.id)),
      ...dishes.filter((i) => i.image && !paired.has(i.id)),
      ...dishes.filter((i) => !i.image && !paired.has(i.id)),
    ]
      .slice(0, 24)
      .map((i) => ({
        id: i.id,
        name: i.name.text,
        image: i.image,
        price: i.price,
        description: i.description?.text.slice(0, 120),
        choose: i.groups.some((g) => g.min > 0),
      }));
    return {
      dishes: recommend,
      // Two dishes with one name (blini with jam, blini with caviar) are told apart.
      details: sameNameDetails(published, l),
      // When the kitchen can't make a dish, similar ones are offered (ADR-081).
      cantMakeDishes: dishNames(published, l),
    };
  };
  const offered = routing.locales.filter((l) => l === locale || languages.some((x) => x.locale === l));
  const texts = Object.fromEntries(offered.map((l) => [l, textsIn(l)] as const));
  const catalog: GuestCatalog = Object.fromEntries(
    await Promise.all(
      offered
        .filter((l) => l !== locale)
        .map(async (l) => [l, (await getMessages({ locale: l })).guest as GuestMessages] as const),
    ),
  );

  return (
    <GuestThemeScope
      theme={theme}
      brandColor={look?.brand_color}
      brand={look?.brand}
      demo={isDemoCafe(restaurant)}
    >
      {table ? (
        <GuestI18nProvider
          locale={locale}
          messages={(await getMessages()).guest as GuestMessages}
          catalog={catalog}
        >
          <LocalizedOrderPage
            header={{
              cafeName: table.restaurant_name,
              logoUrl: look?.logo ? dishPhotoUrl(look.logo) : null,
              wordmarkUrl: wordmark ? dishPhotoUrl(wordmark) : null,
              tableLabel: table.table_label,
              languages,
            }}
            texts={texts}
            path={`/m/${restaurant}/${location}`}
            query={query}
            tableId={table.table_id}
            token={token ?? null}
            vapidPublicKey={vapidPublicKey}
            // The kitchen's own "busy" wait wins over the usual one.
            wait={busy ? null : hints.wait}
            pairs={hints.pairs}
          />
        </GuestI18nProvider>
      ) : (
        // No table (or a dead QR code): the café's bar with its languages, one
        // headline, one sentence and one 56 px button back to the menu
        // (benchmark §2.3; ADR-096: no second back link above it).
        <GuestI18nProvider locale={locale} messages={(await getMessages()).guest as GuestMessages}>
          <GuestHeader
            compact
            cafeName={published?.restaurant.name ?? ""}
            logoUrl={look?.logo ? dishPhotoUrl(look.logo) : null}
            wordmarkUrl={wordmark ? dishPhotoUrl(wordmark) : null}
            tableLabel={null}
            languages={routing.locales
              .filter((l) => published?.location.locales.includes(l))
              .map((l) => ({ locale: l, href: `/${l}/m/${restaurant}/${location}/order${query}` }))}
            home={{ href: menuHref }}
            // The order page's bar (ORDER_BAR in order-status-view.tsx).
            width="max-w-[48rem] lg:max-w-[1440px]"
            oneRow
          />
          <main className="mx-auto grid w-full max-w-[48rem] content-start gap-2 px-4 pt-4 pb-10 md:px-8 md:pt-8">
            {token ? (
              <Notice tone="alert">{t("menu.badTable")}</Notice>
            ) : (
              <>
                <h1 className="display-face text-headline leading-[1.2]">{t("order.empty")}</h1>
                <p className="text-muted flex items-start gap-2 text-body">
                  <QrCode size={20} strokeWidth={1.75} aria-hidden className="mt-0.5 flex-none" />
                  {t("menu.noTable")}
                </p>
              </>
            )}
            <a
              href={menuHref}
              className={`${guestStyles.cta} mt-4 flex min-h-14 w-full items-center justify-center px-6 text-body font-semibold md:w-auto md:justify-self-start`}
            >
              {t("order.toMenu")}
            </a>
          </main>
        </GuestI18nProvider>
      )}
    </GuestThemeScope>
  );
}
