// A price as printed on a Yerevan paper menu, in whole drams, or null when it
// isn't one clear number (a range, two sizes, "on request"). Null sends the
// dish to the owner instead of guessing.

const CURRENCY = /֏|դրամ|դր\.?|драм|др\.?|amd|dram|руб\.?/giu;
const MAX_PRICE = 10_000_000;

export function parsePrice(raw: string): number | null {
  const text = raw
    .replace(CURRENCY, " ")
    .replace(/[\s\u00a0\u202f\u2009]+/gu, " ")
    .trim();
  if (!/^\d[\d .,]*$/u.test(text)) return null;

  const compact = text.replace(/ /gu, "");
  let value: number;
  if (/^\d+$/u.test(compact)) {
    value = Number(compact);
  } else if (/^\d{1,3}([.,]\d{3})+$/u.test(compact)) {
    // 1.500 / 1,500 / 1.250.000: thousands separators
    value = Number(compact.replace(/[.,]/gu, ""));
  } else if (/^\d+[.,]0{1,2}$/u.test(compact)) {
    // 1500.00: zero kopeks
    value = Number(compact.split(/[.,]/u)[0]);
  } else {
    return null;
  }
  return Number.isSafeInteger(value) && value <= MAX_PRICE ? value : null;
}
