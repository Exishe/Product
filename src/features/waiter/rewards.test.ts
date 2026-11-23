import { describe, expect, it } from "vitest";
import { parseRewards } from "./rewards";

describe("parseRewards", () => {
  it("reads open claims", () => {
    const [r] = parseRewards([
      { id: "a", table_id: "t1", level: 5, reward: { kind: "percent", percent: 10, text: {} } },
    ]);
    expect(r).toEqual({ id: "a", tableId: "t1", level: 5, kind: "percent", percent: 10, text: {} });
  });
  it("reads a text reward and skips what it cannot read", () => {
    const rows = parseRewards([
      { id: "b", table_id: null, level: 3, reward: { kind: "text", percent: null, text: { hy: "Սուրճ" } } },
      { id: "c", reward: { kind: "other" } },
      { reward: { kind: "percent" } },
      null,
    ]);
    expect(rows.map((x) => x.id)).toEqual(["b"]);
    expect(rows[0]?.text.hy).toBe("Սուրճ");
  });
  it("is empty for anything else", () => {
    expect(parseRewards(null)).toEqual([]);
    expect(parseRewards({})).toEqual([]);
  });
});
