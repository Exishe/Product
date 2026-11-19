import { describe, expect, it } from "vitest";
import { byQuadrant, heatGrid, heatLevel, matrixBasis, parseHeatmap, parseMatrix } from "./insights-model";

const dish = (id: string, qty: number, quadrant: string | null, revenue = qty * 1000) => ({
  id,
  name: { hy: id },
  price: 1000,
  cost: null,
  margin: 1000,
  qty,
  revenue,
  quadrant,
});

const matrix = parseMatrix({
  from: "2026-10-20",
  to: "2026-11-18",
  owner: true,
  sections: [
    {
      id: "s1",
      name: { hy: "Աղցաններ" },
      basis: "margin",
      popularity_line: 3.5,
      margin_line: 850,
      dishes: [dish("a", 10, "plowhorse"), dish("b", 8, "star"), dish("c", 2, "puzzle"), dish("d", 0, "dog")],
    },
    {
      id: "s2",
      name: { hy: "Սուրճ" },
      basis: "price",
      popularity_line: 7,
      margin_line: 900,
      dishes: [dish("e", 20, "star", 30000), dish("f", 20, "star", 40000)],
    },
    {
      id: "s3",
      name: null,
      basis: "price",
      popularity_line: 0,
      margin_line: 0,
      dishes: [dish("g", 0, null)],
    },
  ],
});

describe("byQuadrant", () => {
  it("groups dishes across sections and keeps the section name", () => {
    const q = byQuadrant(matrix);
    expect(q.star.map((d) => d.id)).toEqual(["f", "e", "b"]);
    expect(q.plowhorse[0]?.section).toEqual({ hy: "Աղցաններ" });
    expect(q.dog.map((d) => d.id)).toEqual(["d"]);
  });

  it("carries each section's basis, so a price-ranked dish never reads as a margin", () => {
    const q = byQuadrant(matrix);
    expect(q.star.find((d) => d.id === "b")?.basis).toBe("margin");
    expect(q.star.find((d) => d.id === "e")?.basis).toBe("price");
  });

  it("leaves out dishes of sections without sales", () => {
    const all = Object.values(byQuadrant(matrix)).flat();
    expect(all.some((d) => d.id === "g")).toBe(false);
  });
});

describe("matrixBasis", () => {
  it("is mixed when only some sections have every cost", () => {
    expect(matrixBasis(matrix)).toBe("mixed");
  });

  it("ignores sections without sales", () => {
    expect(matrixBasis({ ...matrix, sections: [matrix.sections[0]!, matrix.sections[2]!] })).toBe("margin");
    expect(matrixBasis({ ...matrix, sections: [matrix.sections[2]!] })).toBe("price");
  });
});

describe("heatGrid", () => {
  const map = parseHeatmap({
    from: "2026-09-24",
    to: "2026-11-18",
    weeks: 8,
    orders: 100,
    cells: [
      { dow: 6, hour: 13, orders: 36, avg: 4.5 },
      { dow: 6, hour: 10, orders: 8, avg: 1 },
      { dow: 6, hour: 11, orders: 4, avg: 0.5 },
      { dow: 6, hour: 20, orders: 16, avg: 2 },
      { dow: 1, hour: 9, orders: 8, avg: 1 },
    ],
  });
  const grid = heatGrid(map);

  it("spans the first to the last hour with orders", () => {
    expect(grid.hours[0]).toBe(9);
    expect(grid.hours.at(-1)).toBe(20);
    expect(grid.rows).toHaveLength(7);
    expect(grid.rows[5]?.[13 - 9]).toBe(4.5);
  });

  it("finds the busiest hour and the quietest open hour", () => {
    expect(grid.busiest).toEqual({ dow: 6, hour: 13, avg: 4.5 });
    // Saturday 12:00 had no orders but sits between 10:00 and 20:00.
    expect(grid.quietest).toEqual({ dow: 6, hour: 12, avg: 0 });
  });

  it("is empty without orders", () => {
    expect(heatGrid({ ...map, cells: [] })).toEqual({
      hours: [],
      rows: [],
      max: 0,
      busiest: null,
      quietest: null,
    });
  });
});

describe("heatLevel", () => {
  it("keeps zero for empty cells and four steps above it", () => {
    expect(heatLevel(0, 4)).toBe(0);
    expect(heatLevel(0.1, 4)).toBe(1);
    expect(heatLevel(2, 4)).toBe(2);
    expect(heatLevel(3.9, 4)).toBe(4);
    expect(heatLevel(4, 4)).toBe(4);
  });
});
