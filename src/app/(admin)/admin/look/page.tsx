import { ExternalLink, Info } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { AdminPage } from "@/features/admin-ui/page";
import { button } from "@/features/admin-ui/styles";
import { getLocale, getTranslations } from "next-intl/server";
import { AppearanceForm } from "@/features/guest-theme/appearance-form";
import { EMPTY_BRAND, parseBrand } from "@/features/guest-theme/brand";
import type { PreviewDish } from "@/features/guest-theme/brand-preview";
import { formatAmd } from "@/lib/format/money";
import type { Locale } from "@/i18n/routing";
import { SectionCovers, type CoverSection } from "@/features/guest-theme/section-covers";
import { guestTheme } from "@/features/guest-theme/themes";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

const NAME_ORDER = ["hy", "ru", "en"];

// «Հյուրի էջի տեսքը» (ADR-052) and the café's brand profile (ADR-058): theme,
// colours, logo and wordmark, fonts, plates and section covers.
export default async function LookPage() {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const [withBrand, location, sections, t, locale, dishes] = await Promise.all([
    supabase
      .from("restaurants")
      .select("name, slug, brand_color, logo_path, guest_theme, brand")
      .eq("id", me.restaurantId)
      .single(),
    supabase
      .from("locations")
      .select("slug")
      .eq("restaurant_id", me.restaurantId)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, image_path, menu_id, sort, category_translations(locale, name)")
      .eq("restaurant_id", me.restaurantId)
      .eq("is_active", true)
      .order("menu_id")
      .order("sort"),
    getTranslations("look"),
    getLocale(),
    // The café's own dishes with photos, so the preview shows its food on
    // the chosen plates instead of placeholder letters (read only).
    supabase
      .from("items")
      .select("price, image_path, category_id, item_translations(locale, name)")
      .eq("restaurant_id", me.restaurantId)
      .eq("is_active", true)
      .not("image_path", "is", null)
      .order("sort")
      .limit(60),
  ]);
  // Before migration 20261119100000_brand_profile there is no brand column,
  // and before 20261117120000_guest_theme no theme either.
  const brandReady = !withBrand.error;
  const withTheme = brandReady
    ? null
    : await supabase
        .from("restaurants")
        .select("name, slug, brand_color, logo_path, guest_theme")
        .eq("id", me.restaurantId)
        .single();
  const ready = brandReady || !withTheme?.error;
  const row =
    withBrand.data ??
    withTheme?.data ??
    (
      await supabase
        .from("restaurants")
        .select("name, slug, brand_color, logo_path")
        .eq("id", me.restaurantId)
        .single()
    ).data;
  const menuHref = row && location.data ? `/${locale}/m/${row.slug}/${location.data.slug}` : null;

  const covers: CoverSection[] = (sections.data ?? []).map((c) => {
    const names = c.category_translations ?? [];
    const pick = [locale, ...NAME_ORDER].map((l) => names.find((n) => n.locale === l)?.name).find(Boolean);
    return { id: c.id, name: pick ?? null, cover: c.image_path };
  });
  const withPhotos = (dishes.data ?? []).flatMap((d) => {
    const names = d.item_translations ?? [];
    const name = [locale, ...NAME_ORDER].map((l) => names.find((n) => n.locale === l)?.name).find(Boolean);
    return name && Number.isInteger(d.price) && d.price >= 0
      ? [{ category: d.category_id, dish: { name, price: formatAmd(d.price, locale as Locale), image: d.image_path } }]
      : [];
  });
  // The preview's heading names the section its two dishes come from: the
  // first section (in menu order) that has dishes with photos.
  const shownIndex = covers.findIndex((c) => c.name && withPhotos.some((w) => w.category === c.id));
  const shown = covers[shownIndex];
  const sample: PreviewDish[] = shown
    ? withPhotos.filter((w) => w.category === shown.id).slice(0, 2).map((w) => w.dish)
    : [];
  const sampleSections = shown?.name
    ? { current: shown.name, next: covers.slice(shownIndex + 1).find((c) => c.name)?.name ?? null }
    : null;

  return (
    <AdminPage
      width="xl"
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
      {(!ready || !brandReady) && (
        <p
          role="status"
          className="border-amber bg-amber/15 m-0 flex items-start gap-3 rounded-2xl border px-4 py-3 text-[1.0625rem]"
          data-testid="look-pending"
        >
          <Info aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
          {ready ? t("brand.pending") : t("pending")}
        </p>
      )}
      <NextIntlClientProvider>
        <AppearanceForm
          restaurantId={me.restaurantId}
          ready={ready}
          brandReady={brandReady}
          cafeName={row?.name ?? ""}
          cover={covers.find((c) => c.cover)?.cover ?? null}
          sample={sample}
          sampleSections={sampleSections}
          initial={{
            theme: guestTheme(row && "guest_theme" in row ? row.guest_theme : null),
            brandColor: row?.brand_color ?? null,
            logoPath: row?.logo_path ?? null,
          }}
          initialBrand={(withBrand.data && parseBrand(withBrand.data.brand)) || EMPTY_BRAND}
          covers={<SectionCovers restaurantId={me.restaurantId} ready={brandReady} sections={covers} />}
        />
      </NextIntlClientProvider>
    </AdminPage>
  );
}
