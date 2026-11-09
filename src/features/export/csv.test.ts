import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("Տոլմա")).toBe("Տոլմա");
    expect(csvCell(3200)).toBe("3200");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(true)).toBe("true");
  });

  it("writes nothing for null and undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Թեյ, կանաչ")).toBe('"Թեյ, կանաչ"');
    expect(csvCell('«Արարատ» "5"')).toBe('"«Արարատ» ""5"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("defuses spreadsheet formulas in text", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+374")).toBe("'+374");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@x")).toBe("'@x");
  });
});

describe("toCsv", () => {
  it("starts with a BOM so Excel reads Armenian, and ends lines with CRLF", () => {
    const csv = toCsv(
      ["name", "price"],
      [
        ["Տոլմա", 3200],
        ["Սուրճ, հայկական", 700],
      ],
    );
    expect(csv).toBe('﻿name,price\r\nՏոլմա,3200\r\n"Սուրճ, հայկական",700\r\n');
  });
});
