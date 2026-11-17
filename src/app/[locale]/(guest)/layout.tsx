import type { Viewport } from "next";
import { preconnect, preload } from "react-dom";
import { FONTSHARE_API, FONTSHARE_CDN, STARDOM_CSS } from "@/features/guest-theme/fontshare";
import { GuestFonts } from "@/features/guest-theme/guest-fonts";
import { DEFAULT_THEME, themeColor } from "@/features/guest-theme/themes";
import { notoSansArmenian } from "../../fonts";

// The browser bar matches the page; pages that know the café set its theme's colour.
export const viewport: Viewport = { themeColor: themeColor(DEFAULT_THEME) };

// Every guest screen wears a guest theme preset (ADR-051, ADR-052): .guest-lux
// maps the design tokens onto the guest palette, so staff, admin and kitchen
// screens keep theirs. This root wears the default preset; the menu, cart and
// order pages wrap their content in the café's own (GuestThemeScope).
export default function GuestLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preconnect(FONTSHARE_API);
  preconnect(FONTSHARE_CDN, { crossOrigin: "anonymous" });
  preload(STARDOM_CSS, { as: "style" });
  return (
    <div className={`guest-lux ${notoSansArmenian.variable} min-h-dvh`}>
      {children}
      <GuestFonts />
    </div>
  );
}
