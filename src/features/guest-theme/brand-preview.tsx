"use client";

import { useTranslations } from "next-intl";
import { BrandFonts } from "./brand-fonts";
import { brandTokens, googleFontsHref, pickWordmark, wordmarkBackgrounds, type Brand } from "./brand";
import type { GuestTheme } from "./themes";

/** A real dish of the café for the preview: its name, formatted price and photo. */
export type PreviewDish = { name: string; price: string; image: string | null };

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
  sample = [],
}: {
  /** The café's first dishes with photos; placeholders fill in when there are fewer than two. */
  sample?: PreviewDish[];
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
  // The picture that reads on the header band, as on the guest page (ADR-065).
  const wordmark = pickWordmark(brand, wordmarkBackgrounds(theme, brand).header);
  const placeholders: PreviewDish[] = [
    { name: t("previewDish1"), price: t("previewPrice"), image: null },
    { name: t("previewDish2"), price: t("previewPrice"), image: null },
  ];
  const dishes = [...sample, ...placeholders].slice(0, 2);
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
          <span className="border-line-strong/60 rounded-pill text-meta border px-2 py-0.5 font-semibold">
            {g("table", { label: "7" })}
          </span>
          <span className="text-muted text-meta ml-auto flex gap-2 font-semibold">
            {(["hy", "ru", "en"] as const).map((l) => (
              <span key={l} lang={l}>
                {g(`language.${l}`)}
              </span>
            ))}
          </span>
        </div>
        {wordmark ? (
          // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
          <img
            src={storageUrl(wordmark)}
            alt=""
            className="mt-3 block h-14 w-auto max-w-full object-contain"
          />
        ) : (
          <span className="display-face text-title mt-3 block text-[2.5rem] leading-none [overflow-wrap:anywhere]">
            {cafeName}
          </span>
        )}
        <span className="display-face guest-flourish text-title mt-2 block text-[1.375rem] leading-tight">
          {t("previewSection")}
        </span>
      </div>
      <div className="flex gap-2 overflow-hidden px-4 pt-3">
        <span className="bg-tab text-on-tab rounded-pill text-meta px-3 py-1.5 font-semibold whitespace-nowrap">
          {t("previewSection")}
        </span>
        <span className="text-muted rounded-pill text-meta border [border-color:var(--guest-tab-border)] px-3 py-1.5 font-semibold whitespace-nowrap">
          {t("previewDish2")}
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
          {dishes.map((dish, i) => (
            <span
              key={i}
              className="bg-surface shadow-card rounded-card flex min-w-0 flex-col items-center gap-1.5 border [border-color:var(--guest-card-border)] p-3 text-center"
            >
              <span className="bg-dish shadow-plate grid size-20 place-items-center rounded-full">
                {dish.image ? (
                  // The café's own photo on the plate it chose, as guests see it.
                  // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
                  <img src={storageUrl(dish.image)} alt="" className="block size-[82%] rounded-full object-cover" />
                ) : (
                  <span className="grid size-[82%] place-items-center rounded-full border [border-color:var(--guest-dish-rim)]">
                    <span className="display-face text-dish-ink text-2xl leading-none">{dish.name.slice(0, 1)}</span>
                  </span>
                )}
              </span>
              <span className="display-face line-clamp-2 text-[1.0625rem] leading-tight">{dish.name}</span>
              <span className="text-accent-text text-label num font-semibold">{dish.price}</span>
            </span>
          ))}
        </span>
        <span className="bg-accent text-on-accent rounded-pill text-label mt-4 flex h-11 items-center justify-center font-semibold">
          {t("previewAdd")}
          <span className="bg-badge text-on-badge text-meta ml-2 grid size-6 place-items-center rounded-full">
            {2}
          </span>
        </span>
      </div>
    </div>
  );
}
