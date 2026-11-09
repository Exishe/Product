import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Guest pages translate on the server with next-intl and in the browser with
// the small guest formatter (features/ordering/guest-i18n.ts), so no
// NextIntlClientProvider here: it would add next-intl's client runtime to
// every guest page (budget: docs/06-build/plan.md, guest menu JS).
export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return children;
}
