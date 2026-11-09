import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { qrSvg } from "./qr-svg";

const URL_ = "https://pativ.am/t/AQFsXfV5bS5HhX4kTjLqgW1kAAAAAZ0Q8s1T3pXJk2bQ9eFz";

// Rebuilds the module grid from the path's "M x y h w v1 h-w z" runs.
function gridFromPath(svg: string, size: number): boolean[][] {
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const d = /<path[^>]* d="([^"]+)"/.exec(svg)?.[1] ?? "";
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (let i = 0; i < w; i++) grid[y]![x + i] = true;
  }
  return grid;
}

describe("qrSvg", () => {
  it("draws exactly the dark modules of the QR code, with a 4-module quiet zone", () => {
    const svg = qrSvg(URL_, { label: "QR" });
    const qr = encode(URL_, { ecc: "Q", border: 4 });
    expect(svg).toContain(`viewBox="0 0 ${qr.size} ${qr.size}"`);
    expect(gridFromPath(svg, qr.size)).toEqual(qr.data);
    expect(qr.data[0]!.every((dark) => !dark)).toBe(true);
  });

  it("is a labelled image in the ink colour on white, crisp when printed", () => {
    const svg = qrSvg(URL_, { label: "Սեղան 5" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Սեղան 5"');
    expect(svg).toContain('fill="#13241b"');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it("escapes the label", () => {
    expect(qrSvg(URL_, { label: '5 "A" <b>' })).toContain('aria-label="5 &quot;A&quot; &lt;b&gt;"');
  });

  it("is deterministic", () => {
    expect(qrSvg(URL_, { label: "x" })).toBe(qrSvg(URL_, { label: "x" }));
  });

  it("refuses anything but an http(s) URL", () => {
    expect(() => qrSvg("javascript:alert(1)", { label: "x" })).toThrow();
    expect(() => qrSvg("", { label: "x" })).toThrow();
  });
});
