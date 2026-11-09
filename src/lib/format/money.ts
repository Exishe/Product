import type { Locale } from "@/i18n/routing";

// Our own formatter: Chromium has no Armenian number data (i18n.md).
// Separators and the space before ֏ are no-break spaces, so a price never wraps.
const NBSP = " ";

function group(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

export function formatInteger(value: number, locale: Locale): string {
  if (!Number.isInteger(value)) throw new RangeError(`Not an integer: ${value}`);
  const sign = value < 0 ? "−" : "";
  return sign + group(String(Math.abs(value)), locale === "en" ? "," : NBSP);
}

export function formatAmd(amount: number, locale: Locale): string {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`Not a whole, non-negative AMD amount: ${amount}`);
  }
  const digits = formatInteger(amount, locale);
  return locale === "en" ? `AMD${NBSP}${digits}` : `${digits}${NBSP}֏`;
}
