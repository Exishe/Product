import { z } from "zod";

// The shapes of api.menu_engineering and api.sales_heatmap
// (migration 20261119024332_menu_insights, ADR-057).
const names = z.record(z.string(), z.string()).nullable();

export const QUADRANTS = ["star", "plowhorse", "puzzle", "dog"] as const;
export type Quadrant = (typeof QUADRANTS)[number];

const matrixDish = z.object({
  id: z.string(),
  name: names,
  price: z.number().int(),
  cost: z.number().int().nullable(),
  margin: z.number().int(),
  qty: z.number().int(),
  revenue: z.number().int(),
  quadrant: z.enum(QUADRANTS).nullable(),
});

const matrixSchema = z.object({
  from: z.string(),
  to: z.string(),
  owner: z.boolean(),
  sections: z.array(
    z.object({
      id: z.string(),
      name: names,
      basis: z.enum(["margin", "price"]),
      popularity_line: z.number(),
      margin_line: z.number(),
      dishes: z.array(matrixDish),
    }),
  ),
});

export type Matrix = z.infer<typeof matrixSchema>;
export type MatrixDish = z.infer<typeof matrixDish> & { section: Record<string, string> | null };

export function parseMatrix(json: unknown): Matrix {
  return matrixSchema.parse(json);
}

// Every classified dish of the menu, grouped by quadrant. Within a quadrant
// the dishes that matter most come first: by units sold, then revenue.
export function byQuadrant(matrix: Matrix): Record<Quadrant, MatrixDish[]> {
  const out: Record<Quadrant, MatrixDish[]> = { star: [], plowhorse: [], puzzle: [], dog: [] };
  for (const s of matrix.sections)
    for (const d of s.dishes) if (d.quadrant) out[d.quadrant].push({ ...d, section: s.name });
  for (const q of QUADRANTS) out[q].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
  return out;
}

// 'margin' only when every section with sales was ranked by margin; 'mixed'
// when some were; 'price' otherwise.
export function matrixBasis(matrix: Matrix): "margin" | "price" | "mixed" {
  const sold = matrix.sections.filter((s) => s.dishes.some((d) => d.quadrant));
  if (sold.length === 0) return "price";
  const costed = sold.filter((s) => s.basis === "margin").length;
  return costed === sold.length ? "margin" : costed === 0 ? "price" : "mixed";
}

const heatSchema = z.object({
  from: z.string(),
  to: z.string(),
  weeks: z.number().int(),
  orders: z.number().int(),
  cells: z.array(
    z.object({ dow: z.number().int(), hour: z.number().int(), orders: z.number().int(), avg: z.number() }),
  ),
});

export type Heatmap = z.infer<typeof heatSchema>;

export function parseHeatmap(json: unknown): Heatmap {
  return heatSchema.parse(json);
}

export type HeatGrid = {
  hours: number[];
  /** rows[dow - 1][i] is the average for hours[i]; Monday first. */
  rows: number[][];
  max: number;
  busiest: { dow: number; hour: number; avg: number } | null;
  /** The quietest hour inside the opening hours of the busiest weekdays. */
  quietest: { dow: number; hour: number; avg: number } | null;
};

// The heatmap as a 7 × hours grid, from the first to the last hour that had
// any order, so a café open 9:00–23:00 gets 14 columns instead of 24.
export function heatGrid(map: Heatmap): HeatGrid {
  const empty: HeatGrid = { hours: [], rows: [], max: 0, busiest: null, quietest: null };
  if (map.cells.length === 0) return empty;
  const first = Math.min(...map.cells.map((c) => c.hour));
  const last = Math.max(...map.cells.map((c) => c.hour));
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const rows = Array.from({ length: 7 }, () => hours.map(() => 0));
  for (const c of map.cells) {
    const row = rows[c.dow - 1];
    if (row) row[c.hour - first] = c.avg;
  }
  let busiest: HeatGrid["busiest"] = null;
  for (const c of map.cells) if (!busiest || c.avg > busiest.avg) busiest = c;
  // Quiet hours only count on days the café is open: the hour between a
  // day's first and last order with the lowest average.
  let quietest: HeatGrid["quietest"] = null;
  rows.forEach((row, d) => {
    const open = row.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    const start = open[0];
    const end = open[open.length - 1];
    if (open.length < 3 || start === undefined || end === undefined) return;
    for (let i = start + 1; i < end; i++) {
      const v = row[i] ?? 0;
      if (!quietest || v < quietest.avg) quietest = { dow: d + 1, hour: hours[i] ?? 0, avg: v };
    }
  });
  const max = Math.max(...map.cells.map((c) => c.avg));
  return {
    hours,
    rows,
    max,
    busiest: busiest && { dow: busiest.dow, hour: busiest.hour, avg: busiest.avg },
    quietest,
  };
}

// Five steps from empty to the busiest cell; 0 is reserved for "no orders".
export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as 1 | 2 | 3 | 4;
}
