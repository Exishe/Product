import { describe, expect, it } from "vitest";
import { parsePrice } from "./parse-price.ts";

describe("parsePrice", () => {
  it.each([
    ["1500", 1500],
    ["1.500", 1500],
    ["1,500", 1500],
    ["1 500 դր.", 1500],
    ["1 500 ֏", 1500],
    ["1 500 դրամ", 1500],
    ["2500 драм", 2500],
    ["AMD 3,200", 3200],
    ["1500.00", 1500],
    ["12 000", 12000],
    ["800", 800],
    ["0", 0],
  ])("reads %j as %d", (raw, expected) => {
    expect(parsePrice(raw)).toBe(expected);
  });

  it.each([
    ["1500-2000"],
    ["1500–2000"],
    ["1500/2000"],
    ["1.5"],
    ["по запросу"],
    [""],
    ["150000000"],
    ["1500 / 0.5 л"],
  ])("refuses %j", (raw) => {
    expect(parsePrice(raw)).toBeNull();
  });
});
