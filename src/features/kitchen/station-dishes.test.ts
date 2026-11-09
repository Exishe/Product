import { describe, expect, it } from "vitest";
import { stationDishes } from "./station-dishes";

const snapshot = {
  menus: [
    {
      id: "m1",
      categories: [
        { id: "c-hot", name: { hy: "Տաք ուտեստներ", ru: "Горячие блюда" }, item_ids: ["khorovats", "tolma", "gone"] },
        { id: "c-drinks", name: { hy: "Խմիչքներ" }, item_ids: ["coffee"] },
        { id: "c-sweet", name: { hy: "Աղանդեր" }, item_ids: ["gata"] },
      ],
    },
  ],
  items: {
    khorovats: { name: { hy: "Խորոված", ru: "Хоровац" }, prep_area_id: "grill" },
    tolma: { name: { hy: "Տոլմա" }, prep_area_id: null },
    coffee: { name: { hy: "Սուրճ" }, prep_area_id: "bar" },
    gata: { name: { ru: "Гата" }, prep_area_id: "pastry" }, // pastry has no station: goes to the default one
  },
};
const links = [
  { prep_area_id: "grill", station_id: "kitchen" },
  { prep_area_id: "bar", station_id: "bar" },
];

describe("stationDishes", () => {
  it("lists the default station's dishes by menu section, in the kitchen's language", () => {
    expect(stationDishes(snapshot, links, { id: "kitchen", isDefault: true }, "ru")).toEqual([
      {
        category: "Горячие блюда",
        dishes: [
          { id: "khorovats", name: "Хоровац", nameLocale: "ru" },
          { id: "tolma", name: "Տոլմա", nameLocale: "hy" },
        ],
      },
      { category: "Աղանդեր", dishes: [{ id: "gata", name: "Гата", nameLocale: "ru" }] },
    ]);
  });

  it("gives the bar only what the bar makes", () => {
    expect(stationDishes(snapshot, links, { id: "bar", isDefault: false }, "hy")).toEqual([
      { category: "Խմիչքներ", dishes: [{ id: "coffee", name: "Սուրճ", nameLocale: "hy" }] },
    ]);
  });

  it("copes with a missing or empty menu", () => {
    expect(stationDishes(null, links, { id: "kitchen", isDefault: true }, "hy")).toEqual([]);
    expect(stationDishes({ menus: [], items: {} }, [], { id: "kitchen", isDefault: true }, "hy")).toEqual([]);
  });
});
