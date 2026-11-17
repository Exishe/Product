import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { AppearanceForm } from "@/features/guest-theme/appearance-form";
import { guestTheme } from "@/features/guest-theme/themes";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

// «Հյուրի էջի տեսքը» (ADR-052): the café's guest theme, brand colour and logo.
export default async function LookPage() {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const [withTheme, location, t, locale] = await Promise.all([
    supabase.from("restaurants").select("slug, brand_color, logo_path, guest_theme").eq("id", me.restaurantId).single(),
    supabase.from("locations").select("slug").eq("restaurant_id", me.restaurantId).order("created_at").limit(1).maybeSingle(),
    getTranslations("look"),
    getLocale(),
  ]);
  // Before migration 20261117120000_guest_theme the column isn't there yet.
  const ready = !withTheme.error;
  const row = ready
    ? withTheme.data
    : (await supabase.from("restaurants").select("slug, brand_color, logo_path").eq("id", me.restaurantId).single()).data;
  const menuHref = row && location.data ? `/${locale}/m/${row.slug}/${location.data.slug}` : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="display-face text-display-38">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
        {menuHref && (
          <a href={menuHref} target="_blank" rel="noreferrer" className="text-tarragon inline-flex min-h-11 items-center self-start font-semibold underline underline-offset-4">
            {t("openMenu")}
          </a>
        )}
      </header>
      {!ready && (
        <p role="status" className="rounded-input border-apricot border bg-white p-3" data-testid="look-pending">
          {t("pending")}
        </p>
      )}
      <NextIntlClientProvider>
        <AppearanceForm
          restaurantId={me.restaurantId}
          ready={ready}
          initial={{
            theme: guestTheme(row && "guest_theme" in row ? row.guest_theme : null),
            brandColor: row?.brand_color ?? null,
            logoPath: row?.logo_path ?? null,
          }}
        />
      </NextIntlClientProvider>
    </main>
  );
}
