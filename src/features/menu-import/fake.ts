import type { MenuReader, ReadResult } from "./reader.ts";
import type { AiMenu } from "./schema.ts";

// A reader that returns a fixed menu, for tests and for E2E runs
// (AI_PROVIDER=fake). One price is deliberately unclear.

export const FAKE_MENU: AiMenu = {
  source_locale: "hy",
  categories: [
    {
      names: { hy: "Աղցաններ", ru: "Салаты", en: "Salads" },
      items: [
        {
          names: { hy: "Ամառային աղցան", ru: "Летний салат", en: "Summer salad" },
          descriptions: {
            hy: "Լոլիկ, վարունգ, կանաչի",
            ru: "Помидоры, огурцы, зелень",
            en: "Tomatoes, cucumbers, herbs",
          },
          price_amd: 1800,
          price_text: "1 800 դր.",
          confidence: 0.95,
          variants: [],
        },
        {
          names: { hy: "Կեսարի աղցան", ru: "Салат Цезарь", en: "Caesar salad" },
          descriptions: { hy: "", ru: "", en: "" },
          price_amd: 2600,
          price_text: "2.800",
          confidence: 0.6,
          variants: [],
        },
      ],
    },
    {
      names: { hy: "Ըմպելիքներ", ru: "Напитки", en: "Drinks" },
      items: [
        {
          names: { hy: "Թան", ru: "Тан", en: "Tan (yogurt drink)" },
          descriptions: { hy: "", ru: "", en: "" },
          price_amd: 600,
          price_text: "0.33 լ — 600 / 0.5 լ — 900",
          confidence: 0.85,
          variants: [
            { names: { hy: "0.33 լ", ru: "0,33 л", en: "0.33 l" }, price_amd: 600, price_text: "600" },
            { names: { hy: "0.5 լ", ru: "0,5 л", en: "0.5 l" }, price_amd: 900, price_text: "900" },
          ],
        },
      ],
    },
  ],
};

export function fakeReader(menu: AiMenu = FAKE_MENU): MenuReader {
  return {
    async read(): Promise<ReadResult> {
      return { menu: structuredClone(menu), model: "fake", inputTokens: null, outputTokens: null };
    },
  };
}
