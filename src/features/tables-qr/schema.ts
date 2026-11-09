import { z } from "zod";

// A table as the owner types it: a short label (usually the number painted
// on the table), seats, and optionally the area it stands in.
export const tableInput = z.object({
  label: z.string().trim().min(1).max(12),
  seats: z.coerce.number().int().min(1).max(50),
  areaId: z
    .union([z.uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v ? v : null)),
});
export type TableInput = z.input<typeof tableInput>;

const numeric = (label: string) => (/^\d+$/.test(label) ? Number(label) : null);

export function nextTableLabel(labels: readonly string[]): string {
  const numbers = labels.map(numeric).filter((n): n is number => n !== null);
  return String(numbers.length ? Math.max(...numbers) + 1 : labels.length + 1);
}

// Numbered tables in number order (2 before 10), named ones after them.
export function sortTables<T extends { label: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const [x, y] = [numeric(a.label), numeric(b.label)];
    if (x !== null && y !== null) return x - y;
    if (x !== null) return -1;
    if (y !== null) return 1;
    return a.label.localeCompare(b.label);
  });
}

export const CARDS_PER_SHEET = 4;

export function toSheets<T>(cards: readonly T[]): T[][] {
  const sheets: T[][] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_SHEET) sheets.push(cards.slice(i, i + CARDS_PER_SHEET));
  return sheets;
}
