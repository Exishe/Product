import { describe, expect, it } from "vitest";
import { mergeOutRows } from "./out-rows";

describe("mergeOutRows", () => {
  it("shows every listed outage, in the listed order", () => {
    const listed = [
      { id: "b", name: "Milk" },
      { id: "a", name: "Egg" },
    ];
    const r = mergeOutRows(new Set(["a", "b"]), listed, new Map());
    expect(r.rows).toEqual(listed);
    expect(r.unnamed).toBe(0);
  });

  it("without the list, names only what was seen and counts the rest", () => {
    const r = mergeOutRows(new Set(["a", "b", "c"]), null, new Map([["a", "Egg"]]));
    expect(r.rows).toEqual([{ id: "a", name: "Egg" }]);
    expect(r.unnamed).toBe(2);
  });

  it("an empty list is no outage", () => {
    expect(mergeOutRows(new Set(), [], new Map())).toEqual({ rows: [], unnamed: 0 });
  });
});
