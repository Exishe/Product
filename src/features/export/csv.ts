// RFC 4180 CSV for the owner's export. Text that a spreadsheet would run as a
// formula (=, +, -, @, tab, CR at the start) gets a leading apostrophe.

const FORMULA = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export type Cell = string | number | boolean | null | undefined;

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return String(value);
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
