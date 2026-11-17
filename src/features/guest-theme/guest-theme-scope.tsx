import type { ReactNode } from "react";
import { brandStyle, type GuestTheme } from "./themes";

// The café's own theme around one guest page. The guest layout wears the
// default preset; a page that knows the café (menu, cart, order status)
// wraps its content in this, which re-applies .guest-lux with the café's
// preset and brand colour, so every token underneath follows.
export function GuestThemeScope({
  theme,
  brandColor,
  children,
}: {
  theme: GuestTheme;
  brandColor?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="guest-lux flex min-h-dvh flex-col" data-guest-theme={theme} style={brandStyle(theme, brandColor)}>
      {children}
    </div>
  );
}
