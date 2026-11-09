import { Google_Sans, Noto_Serif, Noto_Serif_Armenian } from "next/font/google";

// Google Sans covers Armenian, Cyrillic and Latin in one family (UI text).
export const googleSans = Google_Sans({
  subsets: ["latin", "armenian", "cyrillic"],
  variable: "--font-google-sans",
  display: "swap",
});

// Condensed serif for dish names and headings: Armenian first, then Cyrillic and Latin.
export const notoSerifArmenian = Noto_Serif_Armenian({
  subsets: ["armenian", "latin"],
  axes: ["wdth"],
  variable: "--font-noto-serif-armenian",
  display: "swap",
});

export const notoSerif = Noto_Serif({
  subsets: ["latin", "cyrillic"],
  axes: ["wdth"],
  variable: "--font-noto-serif",
  display: "swap",
});

export const fontVariables = [googleSans.variable, notoSerifArmenian.variable, notoSerif.variable].join(" ");
