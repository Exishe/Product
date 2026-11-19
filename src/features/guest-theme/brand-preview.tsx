"use client";

import { useTranslations } from "next-intl";
import { BrandFonts } from "./brand-fonts";
import { brandTokens, googleFontsHref, type Brand } from "./brand";
import type { GuestTheme } from "./themes";

const storageUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`;

// The top of the café's guest menu in miniature, drawn with the same tokens,
// plate style and header band the guest page gets (brandTokens and the
// data attributes of GuestThemeScope), so the owner sees what guests will.
export function BrandPreview({
  theme,
  brand,
  legacyColor,
  cafeName,
  logo,
  cover,
}: {
  theme: GuestTheme;
  brand: Brand;
  legacyColor: string | null;
  cafeName: string;
  logo: string | null;
  cover: string | null;
}) {
  const t = useTranslations("look.brand");
  const g = useTranslations("guest");
  const { style } = brandTokens(theme, brand, legacyColor);
  const fonts = googleFontsHref(brand);
  const dishes = [t("previewDish1"), t("previewDish2")];
  return (
    <div
      aria-hidden="true"
      className="guest-lux bg-page text-ink shadow-soft relative mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px]"
      data-guest-theme={theme}
      data-guest-preview=""
      data-plate={brand.plate ?? undefined}
      data-brand-header={brand.colors.header ? "" : undefined}
      data-brand-script={brand.scriptFont ? "" : undefined}
      data-testid="brand-preview"
      style={style}
    >
      {fonts && <BrandFonts href={fonts} />}
      <div className="guest-head text-ink px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
            <img src={storageUrl(logo)} alt="" className="bg-surface size-8 rounded-full object-cover" />
          )}
          <span className="border-line-strong/60 rounded-pill border px-2 py-0.5 text-xs font-semibold">
            {g("table", { label: "7" })}
          </span>
          <span className="text-muted ml-auto flex gap-2 text-xs font-semibold">
            {(["hy", "ru", "en"] as const).map((l) => (
              <span key={l} lang={l}>
                {g(`language.${l}`)}
              </span>
            ))}
          </span>
        </div>
        {brand.wordmark ? (
          // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
          <img
            src={storageUrl(brand.wordmark)}
            alt=""
            className="mt-3 block h-14 w-auto max-w-full object-contain"
          />
        ) : (
          <span className="display-face text-title mt-3 block text-[2.5rem] leading-none [overflow-wrap:anywhere]">
            {cafeName}
          </span>
        )}
        <span className="display-face guest-flourish mt-2 block text-[1.375rem] leading-tight text-[color:var(--guest-flourish)]">
          {t("previewSection")}
        </span>
      </div>
      <div className="flex gap-2 overflow-hidden px-4 pt-3">
        <span className="bg-tab text-on-tab rounded-pill px-3 py-1.5 text-xs font-semibold">
          {t("previewSection")}
        </span>
        <span className="text-muted rounded-pill border [border-color:var(--guest-tab-border)] px-3 py-1.5 text-xs font-semibold">
          {dishes[1]}
        </span>
      </div>
      <div className="px-4 pt-4 pb-5">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
          <img
            src={storageUrl(cover)}
            alt=""
            className="rounded-card bg-plate mb-3 block aspect-[21/9] w-full object-cover"
          />
        )}
        <span className="display-face text-title block text-[1.75rem] leading-none">
          {t("previewSection")}
        </span>
        <span className="mt-3 grid grid-cols-2 gap-3">
          {dishes.map((name) => (
            <span
              key={name}
              className="bg-surface shadow-card rounded-card flex flex-col items-center gap-1.5 border [border-color:var(--guest-card-border)] p-3 text-center"
            >
              <span className="bg-dish shadow-plate grid size-16 place-items-center rounded-full">
                <span className="grid size-[82%] place-items-center rounded-full border [border-color:var(--guest-dish-rim)]">
                  <span className="display-face text-dish-ink text-2xl leading-none">{name.slice(0, 1)}</span>
                </span>
              </span>
              <span className="display-face text-[1.0625rem] leading-tight">{name}</span>
              <span className="text-accent-text text-sm font-semibold">{t("previewPrice")}</span>
            </span>
          ))}
        </span>
        <span className="bg-accent text-on-accent rounded-pill mt-4 flex h-10 items-center justify-center text-sm font-semibold">
          {t("previewAdd")}
          <span className="bg-badge text-on-badge ml-2 grid size-5 place-items-center rounded-full text-[0.6875rem]">
            {2}
          </span>
        </span>
      </div>
    </div>
  );
}
