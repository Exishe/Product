import { describe, expect, it } from "vitest";
import { FAKE_MENU } from "./fake.ts";
import { normalizeDraft } from "./normalize.ts";
import { parseReply } from "./parse-reply.ts";
import { ReadError } from "./reader.ts";
import { LOW_CONFIDENCE, aiMenu, aiMenuJsonSchema } from "./schema.ts";

describe("normalizeDraft", () => {
  const draft = normalizeDraft(FAKE_MENU);
  const [salad, caesar] = draft.categories[0]!.items;
  const tan = draft.categories[1]!.items[0]!;

  it("keeps a price that the printed text confirms", () => {
    expect(salad!.price_amd).toBe(1800);
    expect(salad!.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
  });

  it("takes the printed price over the model's and flags the dish", () => {
    expect(caesar!.price_amd).toBe(2800);
    expect(caesar!.confidence).toBeLessThan(LOW_CONFIDENCE);
  });

  it("starts a dish with sizes at its cheapest size and asks for a look", () => {
    expect(tan.price_amd).toBe(600);
    expect(tan.variants.map((v) => v.price_amd)).toEqual([600, 900]);
    expect(tan.confidence).toBeLessThan(LOW_CONFIDENCE);
  });

  it("starts every dish unreviewed", () => {
    expect(draft.categories.flatMap((c) => c.items).every((i) => i.reviewed === false)).toBe(true);
  });

  it("drops empty sections and flags a dish without an Armenian name", () => {
    const menu = structuredClone(FAKE_MENU);
    menu.categories.push({ names: { hy: "Դատարկ", ru: "", en: "" }, items: [] });
    menu.categories[0]!.items[0]!.names.hy = "";
    const result = normalizeDraft(menu);
    expect(result.categories).toHaveLength(2);
    expect(result.categories[0]!.items[0]!.confidence).toBeLessThan(LOW_CONFIDENCE);
  });

  it("never guesses a price that isn't printed", () => {
    const menu = structuredClone(FAKE_MENU);
    Object.assign(menu.categories[0]!.items[0]!, { price_amd: null, price_text: "" });
    expect(normalizeDraft(menu).categories[0]!.items[0]!.price_amd).toBeNull();
  });
});

describe("parseReply", () => {
  it("accepts a reply that matches the schema", () => {
    expect(parseReply(JSON.stringify(FAKE_MENU)).categories).toHaveLength(2);
  });

  it("calls an empty reading not a menu", () => {
    expect(() => parseReply(JSON.stringify({ source_locale: "hy", categories: [] }))).toThrow(
      new ReadError("not_a_menu"),
    );
  });

  it("refuses text that isn't JSON or doesn't match", () => {
    expect(() => parseReply("Here is the menu:")).toThrow(ReadError);
    expect(() => parseReply(JSON.stringify({ categories: [{}] }))).toThrow(ReadError);
  });
});

describe("aiMenuJsonSchema", () => {
  it("describes the same object the Zod schema checks", () => {
    const schema = aiMenuJsonSchema();
    expect(schema.type).toBe("object");
    expect(schema).not.toHaveProperty("$schema");
    expect(JSON.stringify(schema)).not.toMatch(/maxLength|maxItems|maximum/u);
    expect(aiMenu.safeParse(FAKE_MENU).success).toBe(true);
  });
});
