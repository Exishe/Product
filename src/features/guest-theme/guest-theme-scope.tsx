import type { ReactNode } from "react";
import { preconnect, preload } from "react-dom";
import { BrandFonts } from "./brand-fonts";
import { brandPage, brandTokens, googleFontsHref, parseBrand } from "./brand";
import type { GuestTheme } from "./themes";

// Overscroll beyond the page shows the brand's page colour; `page` is a
// checked #rrggbb (parseBrand), so it is safe in a style element.
const overscroll = (page: string) =>
  `body:has(.guest-lux[data-guest-theme]:not([data-guest-preview])){background:${page}}`;

// The café's own theme around one guest page. The guest layout wears the
// default preset; a page that knows the café (menu, cart, order status)
// wraps its content in this, which re-applies .guest-lux with the café's
// preset, brand colour and brand profile (ADR-058), so every token
// underneath follows. Without a brand nothing but the preset is set.
export function GuestThemeScope({
  theme,
  brandColor,
  brand: rawBrand,
  children,
}: {
  theme: GuestTheme;
  brandColor?: string | null;
  /** restaurants.brand as api.public_menu returns it. */
  brand?: unknown;
  children: ReactNode;
}) {
  const brand = parseBrand(rawBrand);
  const { style } = brandTokens(theme, brand, brandColor);
  const fonts = googleFontsHref(brand);
  const page = brandPage(brand, theme);
  if (fonts) {
    preconnect("https://fonts.googleapis.com");
    preconnect("https://fonts.gstatic.com", { crossOrigin: "anonymous" });
    preload(fonts, { as: "style" });
  }
  return (
    <div
      className="guest-lux flex min-h-dvh flex-col"
      data-guest-theme={theme}
      data-plate={brand?.plate ?? undefined}
      data-brand-header={brand?.colors.header ? "" : undefined}
      data-brand-script={brand?.scriptFont ? "" : undefined}
      style={style}
    >
      {page && <style dangerouslySetInnerHTML={{ __html: overscroll(page) }} />}
      {children}
      {fonts && <BrandFonts href={fonts} />}
    </div>
  );
}
