import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { GuestHeader } from "@/features/menu/guest-menu/guest-header";
import { Notice } from "@/features/menu/guest-menu/ui";
import { GuestI18nProvider, type GuestMessages } from "@/features/ordering/guest-i18n-context";
import { OrderStatusView } from "@/features/ordering/order-status-view";
import { resolveTable } from "@/features/ordering/resolve-table.server";
import { routing, type Locale } from "@/i18n/routing";

type Params = Promise<{ locale: string; restaurant: string; location: string }>;
type Search = Promise<{ t?: string | string[] }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "guest.cart" });
  return { title: t("title") };
}

// Order status: /{locale}/m/{café}/{location}/order?t=<token>. The token
// names the table; the guest's orders are read in the browser with the
// guest's own session (RLS), so this page holds no guest data on the server.
export default async function OrderStatusPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale, restaurant, location } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const token = first((await searchParams).t);
  const resolved = token ? await resolveTable(token) : null;
  const table = resolved && resolved.restaurant_slug === restaurant && resolved.location_slug === location ? resolved : null;
  const query = token ? `?t=${encodeURIComponent(token)}` : "";
  const menuHref = `/${locale}/m/${restaurant}/${location}${query}`;
  const hrefFor = (l: Locale) => `/${l}/m/${restaurant}/${location}/order${query}`;
  const t = await getTranslations({ locale, namespace: "guest" });

  return (
    <div className="min-h-dvh bg-mist">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-matsoni">
        {table ? (
          <>
            <GuestHeader locale={locale} cafeName={table.restaurant_name} tableLabel={table.table_label} locales={table.guest_locales} hrefFor={hrefFor} />
            <GuestI18nProvider locale={locale} messages={(await getMessages()).guest as GuestMessages}>
              <OrderStatusView tableId={table.table_id} menuHref={menuHref} />
            </GuestI18nProvider>
          </>
        ) : (
          <main className="grid gap-4 px-4 py-10">
            <Notice tone="alert">{token ? t("menu.badTable") : t("menu.noTable")}</Notice>
            <a href={menuHref} className="inline-flex min-h-12 items-center font-semibold text-tarragon">
              {t("order.toMenu")}
            </a>
          </main>
        )}
      </div>
    </div>
  );
}
