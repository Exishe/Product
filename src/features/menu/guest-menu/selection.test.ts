import { describe, expect, it } from "vitest";
import { initialSelection, isSelectionValid, selectedIds, toggleOption, unitPrice, type Group } from "./selection";

const opt = (id: string, delta = 0, isDefault = false) => ({ id, delta, isDefault });
const size: Group = { id: "size", min: 1, max: 1, modifiers: [opt("s250"), opt("s350", 300)] };
const sugar: Group = { id: "sugar", min: 1, max: 1, modifiers: [opt("none"), opt("medium", 0, true), opt("sweet")] };
const milk: Group = { id: "milk", min: 0, max: 1, modifiers: [opt("oat", 300), opt("lactose", 200)] };
const extras: Group = { id: "extras", min: 0, max: 2, modifiers: [opt("honey", 150), opt("cinnamon", 100), opt("lemon", 50)] };
const sauces: Group = { id: "sauces", min: 2, max: 3, modifiers: [opt("a"), opt("b", 0, true), opt("c"), opt("d")] };

describe("initialSelection", () => {
  it("preselects defaults, and the first option of a required group without one", () => {
    expect(initialSelection([size, sugar, milk])).toEqual({ size: ["s250"], sugar: ["medium"], milk: [] });
  });

  it("fills a required group up to its minimum, defaults first", () => {
    expect(initialSelection([sauces])).toEqual({ sauces: ["a", "b"] });
  });

  it("never preselects more than the maximum", () => {
    const g: Group = { id: "g", min: 0, max: 1, modifiers: [opt("x", 0, true), opt("y", 0, true)] };
    expect(initialSelection([g])).toEqual({ g: ["x"] });
  });
});

describe("toggleOption", () => {
  it("works like radio buttons in a required single choice", () => {
    let s = initialSelection([size]);
    s = toggleOption(s, size, "s350");
    expect(s.size).toEqual(["s350"]);
    s = toggleOption(s, size, "s350"); // tapping the chosen one keeps it
    expect(s.size).toEqual(["s350"]);
  });

  it("lets an optional single choice be switched and cleared", () => {
    let s = initialSelection([milk]);
    s = toggleOption(s, milk, "oat");
    expect(s.milk).toEqual(["oat"]);
    s = toggleOption(s, milk, "lactose");
    expect(s.milk).toEqual(["lactose"]);
    s = toggleOption(s, milk, "lactose");
    expect(s.milk).toEqual([]);
  });

  it("allows up to the maximum in a multiple choice and ignores more", () => {
    let s = initialSelection([extras]);
    s = toggleOption(s, extras, "honey");
    s = toggleOption(s, extras, "lemon");
    s = toggleOption(s, extras, "cinnamon");
    expect(s.extras).toEqual(["honey", "lemon"]);
    s = toggleOption(s, extras, "honey");
    expect(s.extras).toEqual(["lemon"]);
  });

  it("lets a guest clear a required multiple choice, which makes it invalid", () => {
    let s = initialSelection([sauces]);
    s = toggleOption(s, sauces, "a");
    expect(s.sauces).toEqual(["b"]);
    expect(isSelectionValid([sauces], s)).toBe(false);
  });

  it("ignores options that aren't in the group", () => {
    const s = initialSelection([milk]);
    expect(toggleOption(s, milk, "nope")).toEqual(s);
  });
});

describe("isSelectionValid", () => {
  it("checks min and max of every group", () => {
    expect(isSelectionValid([size, milk], { size: ["s250"], milk: [] })).toBe(true);
    expect(isSelectionValid([size, milk], { size: [], milk: [] })).toBe(false);
    expect(isSelectionValid([extras], { extras: ["honey", "lemon", "cinnamon"] })).toBe(false);
    expect(isSelectionValid([size], {})).toBe(false);
    expect(isSelectionValid([], {})).toBe(true);
  });

  it("rejects ids that the group doesn't have", () => {
    expect(isSelectionValid([size], { size: ["s999"] })).toBe(false);
  });
});

describe("unitPrice and selectedIds", () => {
  it("adds option prices to the dish price", () => {
    const groups = [size, milk, extras];
    const s = { size: ["s350"], milk: ["oat"], extras: ["honey", "lemon"] };
    expect(unitPrice(1300, groups, s)).toBe(1300 + 300 + 300 + 150 + 50);
  });

  it("lists chosen option ids in menu order, whatever order they were tapped in", () => {
    const groups = [size, extras];
    expect(selectedIds(groups, { extras: ["lemon", "honey"], size: ["s350"] })).toEqual(["s350", "honey", "lemon"]);
  });
});
