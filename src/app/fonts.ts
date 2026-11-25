import { Google_Sans, Noto_Serif, Noto_Serif_Armenian } from "next/font/google";
import localFont from "next/font/local";

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

// Armenian on the guest pages, in titles and in text: Noto Sans Armenian, the
// owner's own download (variable, weight and width axes; SIL OFL 1.1, the licence
// is next to the file). Latin and Cyrillic come from the café's chosen fonts.
export const notoSansArmenian = localFont({
  src: "./fonts/NotoSansArmenian-Variable.ttf",
  variable: "--font-noto-sans-armenian",
  display: "swap",
  weight: "100 900",
});
