import type { ReactNode } from "react";
import { preconnect, preload } from "react-dom";
import { BrandFonts } from "./brand-fonts";
import { brandPage, brandTokens, googleFontsHref, parseBrand } from "./brand";
import { DEMO_PALETTE_KEY } from "./demo";
import { DemoPaletteSync } from "./demo-palette-sync";
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
  demo = false,
  children,
}: {
  theme: GuestTheme;
  brandColor?: string | null;
  /** restaurants.brand as api.public_menu returns it. */
  brand?: unknown;
  /** One of the public demo cafés: black and white, or blue and white by choice. */
  demo?: boolean;
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
      data-demo={demo ? "" : undefined}
      // The demo palette a guest picked is set before the first paint (below).
      suppressHydrationWarning={demo}
      style={style}
    >
      {demo && (
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem(${JSON.stringify(DEMO_PALETTE_KEY)})==="blue")document.currentScript.parentElement.setAttribute("data-demo-palette","blue")}catch(e){}`,
          }}
        />
      )}
      {demo && <DemoPaletteSync />}
      {page && <style dangerouslySetInnerHTML={{ __html: overscroll(page) }} />}
      {children}
      {fonts && <BrandFonts href={fonts} />}
    </div>
  );
}
