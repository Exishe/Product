import { describe, expect, it } from "vitest";
import {
  checkTimeRule,
  draftFromRule,
  emptyDraft,
  normaliseWeekdays,
  parseSort,
  passesMidnight,
  ruleFromDraft,
  ruleFromRow,
  sortRules,
  weekdayRuns,
  type TimeRule,
  type TimeRuleInput,
} from "./time-rules";

const ID = "11111111-1111-4111-8111-111111111111";
const DISH = "22222222-2222-4222-8222-222222222222";

describe("normaliseWeekdays", () => {
  it("sorts, drops repeats and values outside 1 to 7", () => {
    expect(normaliseWeekdays([5, 1, 1, 3, 0, 8, 2.5])).toEqual([1, 3, 5]);
  });
  it("means every day (null) when none or all seven are ticked", () => {
    expect(normaliseWeekdays([])).toBeNull();
    expect(normaliseWeekdays(null)).toBeNull();
    expect(normaliseWeekdays([7, 6, 5, 4, 3, 2, 1])).toBeNull();
  });
});

describe("weekdayRuns", () => {
  it("joins neighbouring days", () => {
    expect(weekdayRuns([1, 2, 3, 4, 5])).toEqual([[1, 5]]);
    expect(weekdayRuns([7, 1, 2, 5])).toEqual([[1, 2], [5, 5], [7, 7]]);
  });
  it("gives nothing for every day", () => {
    expect(weekdayRuns(null)).toEqual([]);
    expect(weekdayRuns([])).toEqual([]);
  });
});

describe("passesMidnight", () => {
  it("is true only when the window ends earlier on the clock than it starts", () => {
    expect(passesMidnight("22:00", "02:00")).toBe(true);
    expect(passesMidnight("08:00", "11:00")).toBe(false);
    expect(passesMidnight("08:00", "08:00")).toBe(false);
    expect(passesMidnight("", "02:00")).toBe(false);
  });
});

describe("parseSort", () => {
  it("reads an empty box as 0 and whole numbers in range", () => {
    expect(parseSort("")).toBe(0);
    expect(parseSort("  ")).toBe(0);
    expect(parseSort("3")).toBe(3);
    expect(parseSort("-1000")).toBe(-1000);
    expect(parseSort("1000")).toBe(1000);
  });
  it("refuses everything else", () => {
    expect(parseSort("1001")).toBeNull();
    expect(parseSort("2.5")).toBeNull();
    expect(parseSort("abc")).toBeNull();
    expect(parseSort("1e3")).toBeNull();
  });
});

describe("ruleFromDraft", () => {
  const draft = { ...emptyDraft(), toType: "coffee_tea" };

  it("turns the form into a rule for a kind of dish", () => {
    expect(ruleFromDraft(draft)).toEqual({
      ok: true,
      rule: { id: null, from: "08:00", to: "11:00", weekdays: null, toType: "coffee_tea", toItemId: null, sort: 0 },
    });
  });
  it("keeps ticked days, in order, and treats all seven as every day", () => {
    const some = ruleFromDraft({ ...draft, days: [5, 1, 2] });
    expect(some.ok && some.rule.weekdays).toEqual([1, 2, 5]);
    const all = ruleFromDraft({ ...draft, days: [1, 2, 3, 4, 5, 6, 7] });
    expect(all.ok && all.rule.weekdays).toBeNull();
  });
  it("turns the form into a rule for one dish, with an order", () => {
    const r = ruleFromDraft({ ...emptyDraft(), id: ID, target: "dish", toItemId: DISH, toType: "main", order: "2", from: "22:00", to: "02:00" });
    expect(r).toEqual({
      ok: true,
      rule: { id: ID, from: "22:00", to: "02:00", weekdays: null, toType: null, toItemId: DISH, sort: 2 },
    });
  });
  it("says what is missing", () => {
    expect(ruleFromDraft({ ...draft, to: "08:00" })).toEqual({ ok: false, error: "times" });
    expect(ruleFromDraft({ ...draft, from: "" })).toEqual({ ok: false, error: "times" });
    expect(ruleFromDraft({ ...draft, from: "25:00" })).toEqual({ ok: false, error: "times" });
    expect(ruleFromDraft({ ...draft, toType: "" })).toEqual({ ok: false, error: "kind" });
    expect(ruleFromDraft({ ...draft, toType: "pizza" })).toEqual({ ok: false, error: "kind" });
    expect(ruleFromDraft({ ...draft, target: "dish" })).toEqual({ ok: false, error: "dish" });
    expect(ruleFromDraft({ ...draft, order: "many" })).toEqual({ ok: false, error: "order" });
  });
});

describe("checkTimeRule", () => {
  const ok: TimeRuleInput = { id: null, from: "08:00", to: "11:00", weekdays: [1, 2], toType: "dessert", toItemId: null, sort: 0 };
  it("accepts a good rule, with a window past midnight too", () => {
    expect(checkTimeRule(ok)).toBeNull();
    expect(checkTimeRule({ ...ok, from: "22:00", to: "02:00" })).toBeNull();
  });
  it("refuses an empty window, no target, two targets and a wild order", () => {
    expect(checkTimeRule({ ...ok, to: "08:00" })).toBe("times");
    expect(checkTimeRule({ ...ok, toType: null })).toBe("kind");
    expect(checkTimeRule({ ...ok, toItemId: DISH })).toBe("dish");
    expect(checkTimeRule({ ...ok, sort: 5000 })).toBe("order");
    expect(checkTimeRule({ ...ok, sort: 1.5 })).toBe("order");
  });
});

describe("ruleFromRow", () => {
  const row = { id: ID, from_time: "08:00:00", to_time: "11:30:00", weekdays: [3, 1], to_type: "coffee_tea", to_item_id: null, sort: 2 };
  it("reads a database row (times without seconds, days in order)", () => {
    expect(ruleFromRow(row)).toEqual({
      id: ID,
      from: "08:00",
      to: "11:30",
      weekdays: [1, 3],
      toType: "coffee_tea",
      toItemId: null,
      sort: 2,
    });
  });
  it("reads a rule for one dish with every day", () => {
    const r = ruleFromRow({ ...row, weekdays: null, to_type: null, to_item_id: DISH });
    expect(r).toMatchObject({ weekdays: null, toType: null, toItemId: DISH });
  });
  it("drops rows that do not fit", () => {
    expect(ruleFromRow(null)).toBeNull();
    expect(ruleFromRow({ ...row, id: 5 })).toBeNull();
    expect(ruleFromRow({ ...row, from_time: null })).toBeNull();
    expect(ruleFromRow({ ...row, to_type: null })).toBeNull();
    expect(ruleFromRow({ ...row, to_item_id: DISH })).toBeNull();
    expect(ruleFromRow({ ...row, to_type: "pizza" })).toBeNull();
  });
});

describe("draftFromRule", () => {
  it("fills the form from a rule and back again", () => {
    const rule: TimeRule = { id: ID, from: "08:00", to: "11:00", weekdays: [1, 2], toType: "coffee_tea", toItemId: null, sort: 4 };
    const draft = draftFromRule(rule);
    expect(draft).toMatchObject({ id: ID, days: [1, 2], target: "type", toType: "coffee_tea", order: "4" });
    const back = ruleFromDraft(draft);
    expect(back.ok && back.rule).toEqual({ ...rule });
  });
  it("shows an order of 0 as an empty box", () => {
    const rule: TimeRule = { id: ID, from: "08:00", to: "11:00", weekdays: null, toType: null, toItemId: DISH, sort: 0 };
    expect(draftFromRule(rule)).toMatchObject({ target: "dish", toItemId: DISH, order: "", days: [] });
  });
});

describe("sortRules", () => {
  it("orders by number, then start time, then id", () => {
    const base = { weekdays: null, toType: "dessert", toItemId: null } as const;
    const rules: TimeRule[] = [
      { ...base, id: "c", from: "18:00", to: "23:00", sort: 1 },
      { ...base, id: "b", from: "12:00", to: "15:00", sort: 0 },
      { ...base, id: "a", from: "08:00", to: "11:00", sort: 1 },
    ];
    expect(sortRules(rules).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(rules.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
