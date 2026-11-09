import { describe, expect, it } from "vitest";
import { formatAmd, formatInteger } from "./money";

const NBSP = " ";

describe("formatAmd", () => {
  it("formats Armenian prices with no-break spaces and the dram sign after", () => {
    expect(formatAmd(1500, "hy")).toBe(`1${NBSP}500${NBSP}֏`);
  });

  it("formats Russian prices the same way", () => {
    expect(formatAmd(1500, "ru")).toBe(`1${NBSP}500${NBSP}֏`);
  });

  it("formats English prices as AMD with commas", () => {
    expect(formatAmd(1500, "en")).toBe(`AMD${NBSP}1,500`);
  });

  it("groups millions", () => {
    expect(formatAmd(12450000, "hy")).toBe(`12${NBSP}450${NBSP}000${NBSP}֏`);
    expect(formatAmd(12450000, "en")).toBe(`AMD${NBSP}12,450,000`);
  });

  it("leaves amounts under a thousand ungrouped, including zero", () => {
    expect(formatAmd(999, "hy")).toBe(`999${NBSP}֏`);
    expect(formatAmd(0, "ru")).toBe(`0${NBSP}֏`);
  });

  it("refuses fractions and negative amounts (money is whole drams)", () => {
    expect(() => formatAmd(1500.5, "hy")).toThrow(RangeError);
    expect(() => formatAmd(-1, "hy")).toThrow(RangeError);
    expect(() => formatAmd(Number.NaN, "hy")).toThrow(RangeError);
  });
});

describe("formatInteger", () => {
  it("groups with no-break spaces in hy and ru and commas in en", () => {
    expect(formatInteger(12450000, "hy")).toBe(`12${NBSP}450${NBSP}000`);
    expect(formatInteger(12450000, "ru")).toBe(`12${NBSP}450${NBSP}000`);
    expect(formatInteger(12450000, "en")).toBe("12,450,000");
  });
});
