import { createCafeWithMenu, type TestCafe } from "./guest-helpers";

// A café whose menu exercises what the demo café's doesn't: a 70+ character
// name (Review focus 3), missing translations (Review focus 5), a sold-out
// dish and a multiple-choice option group.
export const LONG_RU = "Домашняя хашлама из молодой баранины с картофелем, баклажанами и свежей зеленью";
export const LONG_HY = "Տնական խաշլամա գառան մսով, կարտոֆիլով, սմբուկով, լոլիկով և թարմ կանաչիով";

export function createTestCafe(tables: string[] = ["1", "2"]): Promise<TestCafe> {
  return createCafeWithMenu({
    categories: [
      { key: "hot", names: { hy: "Տաք ուտեստներ", ru: "Горячие блюда", en: "Hot dishes" } },
      { key: "coffee", names: { hy: "Սուրճ", ru: "Кофе", en: "Coffee" } },
    ],
    dishes: [
      {
        key: "tolma",
        category: "hot",
        names: { hy: "Տոլմա", ru: "Толма", en: "Tolma" },
        description: { hy: "Տավարի միս խաղողի տերևի մեջ", ru: "Говядина в виноградных листьях", en: "Beef in grape leaves" },
        price: 3200,
        portion: { amount: 300, unit: "g" },
        tags: ["popular"],
      },
      {
        key: "long",
        category: "hot",
        names: { hy: LONG_HY, ru: LONG_RU, en: "Homemade khashlama with young lamb, potatoes, aubergine, tomatoes and fresh herbs" },
        price: 12450,
      },
      { key: "borani", category: "hot", names: { hy: "Բորանի", ru: "Борани" }, price: 2600 },
      { key: "syrniki", category: "hot", names: { ru: "Сырники со сметаной" }, price: 1900 },
      { key: "trout", category: "hot", names: { hy: "Սևանի իշխան", ru: "Севанская форель", en: "Sevan trout" }, price: 5200, soldOut: true },
      {
        key: "coffee",
        category: "coffee",
        names: { hy: "Հայկական սուրճ", ru: "Армянский кофе", en: "Armenian coffee" },
        price: 700,
        groups: [
          {
            names: { hy: "Շաքար", ru: "Сахар", en: "Sugar" },
            min: 1,
            max: 1,
            options: [
              { names: { hy: "Առանց շաքարի", ru: "Без сахара", en: "No sugar" } },
              { names: { hy: "Միջին", ru: "Средний", en: "Medium" }, isDefault: true },
              { names: { hy: "Քաղցր", ru: "Сладкий", en: "Sweet" } },
            ],
          },
          {
            names: { hy: "Հավելումներ", ru: "Добавки", en: "Extras" },
            min: 0,
            max: 2,
            options: [
              { names: { hy: "Կաթ", ru: "Молоко", en: "Milk" }, delta: 200 },
              { names: { hy: "Դարչին", ru: "Корица", en: "Cinnamon" }, delta: 100 },
              { names: { hy: "Մեղր", ru: "Мёд", en: "Honey" }, delta: 150 },
            ],
          },
        ],
      },
    ],
    tables,
  });
}
