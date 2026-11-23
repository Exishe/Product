import { describe, expect, it } from "vitest";
import { groupOf, groupSections } from "./section-groups";

describe("groupOf", () => {
  it.each([
    ["Breakfast", "food"],
    ["Խորոված", "food"],
    ["Горячие блюда", "food"],
    ["Desserts", "desserts"],
    ["Աղանդեր", "desserts"],
    ["Десерты", "desserts"],
    ["Coffee and tea", "drinks"],
    ["Սուրճ", "drinks"],
    ["Напитки", "drinks"],
    ["Թարմ քամված հյութեր և լիմոնադներ", "drinks"],
    ["Red wine", "wine"],
    ["Կարմիր գինի", "wine"],
    ["Գինի բաժակով", "wine"],
    ["Փրփրուն գինի", "wine"],
    ["Игристое вино", "wine"],
    ["Վերմուտ", "wine"],
    ["Ջին", "wine"],
  ])("%s is %s", (name, group) => expect(groupOf(name)).toBe(group));

  it("keeps an unknown name with the food", () => {
    expect(groupOf("Something new")).toBe("food");
    expect(groupOf(null)).toBe("food");
  });
});

describe("groupSections", () => {
  it("keeps menu order inside a group and drops empty groups", () => {
    const s = [{ name: { text: "Coffee" } }, { name: { text: "Breakfast" } }, { name: { text: "Tea" } }];
    const g = groupSections(s);
    expect(g.map((x) => x.group)).toEqual(["food", "drinks"]);
    expect(g[1]!.sections.map((x) => x.name!.text)).toEqual(["Coffee", "Tea"]);
  });
});
