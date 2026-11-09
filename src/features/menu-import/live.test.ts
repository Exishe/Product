import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { geminiReader } from "./gemini.server.ts";
import { normalizeDraft } from "./normalize.ts";

// Reads the two sample menus with the real Gemini API. Off by default (it
// needs a key and spends free-tier quota): LIVE_AI=1 npx vitest run live
// Optional: GEMINI_MODEL to compare models on the same photos, LIVE_AI_OUT=dir
// to keep the readings for a look by eye.

const live = process.env.LIVE_AI === "1";
const model = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
const photo = (name: string) => ({
  mimeType: "image/jpeg" as const,
  data: readFileSync(new URL(`../../../tests/fixtures/menus/${name}`, import.meta.url)).toString("base64"),
});
const keep = (name: string, value: unknown) => {
  if (process.env.LIVE_AI_OUT)
    writeFileSync(`${process.env.LIVE_AI_OUT}/${name}.json`, JSON.stringify(value, null, 1));
};
const dishes = (draft: ReturnType<typeof normalizeDraft>) => draft.categories.flatMap((c) => c.items);
const priceOf = (draft: ReturnType<typeof normalizeDraft>, pattern: RegExp) =>
  dishes(draft).find((d) => pattern.test(d.names.hy) || pattern.test(d.names.ru))?.price_amd;

describe.runIf(live)(`menu photos read by ${model}`, { timeout: 120_000 }, () => {
  const reader = geminiReader(process.env.GEMINI_API_KEY ?? "proxy-injected", [model]);

  it("reads the Armenian menu: three sections, eight dishes, prices in drams, no footer", async () => {
    const result = await reader.read([photo("armenian-cafe.jpg")]);
    const draft = normalizeDraft(result.menu);
    keep("armenian", { model: result.model, tokens: [result.inputTokens, result.outputTokens], draft });
    expect(draft.source_locale).toBe("hy");
    expect(draft.categories).toHaveLength(3);
    expect(dishes(draft)).toHaveLength(8);
    expect(priceOf(draft, /Խաշլամա/u)).toBe(4500);
    expect(priceOf(draft, /Պանր/u)).toBe(2500);
    expect(dishes(draft).some((d) => /tsiran|Wi-Fi/iu.test(JSON.stringify(d)))).toBe(false);
    const tan = dishes(draft).find((d) => /Թան/u.test(d.names.hy));
    expect(tan?.variants.map((v) => v.price_amd)).toEqual([500, 800]);
    expect(tan?.names.hy).not.toMatch(/0\.33/u);
    expect(dishes(draft).every((d) => d.names.ru !== "" && d.names.en !== "")).toBe(true);
  });

  it("reads the Russian menu: dotted thousands, and no price for a range", async () => {
    const result = await reader.read([photo("russian-cafe.jpg")]);
    const draft = normalizeDraft(result.menu);
    keep("russian", { model: result.model, tokens: [result.inputTokens, result.outputTokens], draft });
    expect(draft.source_locale).toBe("ru");
    expect(dishes(draft)).toHaveLength(7);
    expect(priceOf(draft, /Сырники/u)).toBe(1800);
    expect(priceOf(draft, /Хоровац/u)).toBe(3200);
    expect(priceOf(draft, /Шашлык/u)).toBeNull();
    expect(dishes(draft).every((d) => d.names.hy !== "")).toBe(true);
  });
});
