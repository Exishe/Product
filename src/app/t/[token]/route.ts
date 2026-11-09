import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { resolveTable } from "@/features/ordering/resolve-table.server";
import { tableErrorHtml } from "@/features/ordering/table-error-page";
import { resolveTableEntry } from "@/features/ordering/table-entry";
import { pickGuestLocale } from "@/lib/i18n/pick-locale";

// The table QR: /t/<token>. A malformed token is refused before any database
// call; a valid sticker redirects (307) to the café's menu in the guest's
// language with the token kept in the URL; an old, tampered or forged one gets
// a friendly "ask your waiter" page with HTTP 404 (Review focus 2).
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const visitor = {
    acceptLanguage: request.headers.get("accept-language"),
    chosenLocale: request.cookies.get("NEXT_LOCALE")?.value,
  };
  const noStore = { "cache-control": "private, no-store" };

  const entry = await resolveTableEntry(token, visitor, resolveTable);
  if (entry.kind === "menu") return new Response(null, { status: 307, headers: { ...noStore, location: entry.href } });

  const locale = pickGuestLocale({
    chosen: visitor.chosenLocale,
    acceptLanguage: visitor.acceptLanguage,
    offered: routing.locales,
    fallback: routing.defaultLocale,
  });
  const t = await getTranslations({ locale, namespace: "guest.entry" });
  return new Response(tableErrorHtml(locale, { title: t("title"), body: t("body") }), {
    status: 404,
    headers: { ...noStore, "content-type": "text/html; charset=utf-8", "content-language": locale },
  });
}
