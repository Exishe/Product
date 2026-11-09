import type { Metadata, Viewport } from "next";
import { getLocale } from "next-intl/server";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pativ",
  description: "Pativ",
};

export const viewport: Viewport = {
  themeColor: "#1d6a43",
};

// One root layout for every surface: the language comes from the URL on guest
// pages and from the member's setting elsewhere, so <html lang> is set here.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
