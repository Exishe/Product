import { ExternalLink, Info } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { AdminPage } from "@/features/admin-ui/page";
import { button } from "@/features/admin-ui/styles";
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
    supabase
      .from("restaurants")
      .select("slug, brand_color, logo_path, guest_theme")
      .eq("id", me.restaurantId)
      .single(),
    supabase
      .from("locations")
      .select("slug")
      .eq("restaurant_id", me.restaurantId)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    getTranslations("look"),
    getLocale(),
  ]);
  // Before migration 20261117120000_guest_theme the column isn't there yet.
  const ready = !withTheme.error;
  const row = ready
    ? withTheme.data
    : (
        await supabase
          .from("restaurants")
          .select("slug, brand_color, logo_path")
          .eq("id", me.restaurantId)
          .single()
      ).data;
  const menuHref = row && location.data ? `/${locale}/m/${row.slug}/${location.data.slug}` : null;

  return (
    <AdminPage
      title={t("title")}
      subtitle={<p className="m-0">{t("intro")}</p>}
      actions={
        menuHref && (
          <a
            href={menuHref}
            target="_blank"
            rel="noreferrer"
            className={button("secondary", "min-h-11 text-[0.9375rem]")}
          >
            <ExternalLink aria-hidden="true" className="!size-4" />
            {t("openMenu")}
          </a>
        )
      }
    >
      {!ready && (
        <p
          role="status"
          className="m-0 flex items-start gap-3 rounded-2xl bg-[#fdf0dc] px-4 py-3 text-[1.0625rem]"
          data-testid="look-pending"
        >
          <Info aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
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
    </AdminPage>
  );
}
