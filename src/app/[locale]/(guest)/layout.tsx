import type { Viewport } from "next";
import { preconnect, preload } from "react-dom";
import { FONTSHARE_API, FONTSHARE_CDN, STARDOM_CSS } from "@/features/guest-theme/fontshare";
import { GuestFonts } from "@/features/guest-theme/guest-fonts";

// The browser bar matches the noir header band.
export const viewport: Viewport = { themeColor: "#1b1712" };

// Every guest screen (menu, cart, order status) wears the "Noir & Champagne"
// theme (ADR-051): .guest-lux maps the design tokens onto the guest palette,
// so staff, admin and kitchen screens keep theirs.
export default function GuestLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preconnect(FONTSHARE_API);
  preconnect(FONTSHARE_CDN, { crossOrigin: "anonymous" });
  preload(STARDOM_CSS, { as: "style" });
  return (
    <div className="guest-lux min-h-dvh">
      {children}
      <GuestFonts />
    </div>
  );
}
