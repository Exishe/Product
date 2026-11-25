import { getTranslations } from "next-intl/server";
import { MenuFallbackTextProvider } from "@/features/menu/guest-menu/menu-fallback";

// The menu's own segment (a route group, so the order page keeps its own
// loading and error screens): it hands the loading skeleton and the error
// screen their text, translated here on the server, so neither needs the
// whole guest dictionary in the browser.
export default async function MenuLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "guest.menu" });
  const text = {
    loading: t("loading"),
    title: t("loadFailedTitle"),
    body: t("loadFailedBody"),
    reload: t("reload"),
  };
  return <MenuFallbackTextProvider value={text}>{children}</MenuFallbackTextProvider>;
}
