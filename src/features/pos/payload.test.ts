import { describe, expect, it } from "vitest";
import { samplePayload } from "./fixtures";
import { lineComment, posPayloadSchema, substitutionText, unmappedNames, webhookBody } from "./payload";

describe("payload", () => {
  it("parses what the database builds", () => {
    expect(posPayloadSchema.safeParse(samplePayload()).success).toBe(true);
    // A test send has no Pativ order and may have no table.
    const test = samplePayload({ test: true, table: null, table_session_id: null });
    test.order.id = null;
    expect(posPayloadSchema.safeParse(test).success).toBe(true);
  });

  it("refuses something else", () => {
    expect(posPayloadSchema.safeParse({ ...samplePayload(), event: "order.cancelled" }).success).toBe(false);
  });

  it("lists unmatched dishes and options by name", () => {
    const p = samplePayload();
    expect(unmappedNames(p)).toEqual([]);
    p.order.items[1]!.external_id = null;
    p.order.items[0]!.modifiers[0]!.external_id = null;
    expect(unmappedNames(p)).toEqual(["Հավի խորոված (Մեծ)", "Տոլմա"]);
  });

  it("writes the line comment from the note and the swap", () => {
    const [a, b] = samplePayload().order.items;
    expect(lineComment(a!)).toBe("առանց սոխի");
    expect(lineComment(b!)).toBe("→ Բլղուր");
    expect(substitutionText(null)).toBeNull();
  });

  it("sends a webhook the payload without internal fields", () => {
    const body = webhookBody(samplePayload());
    expect(body).not.toHaveProperty("table_session_id");
    expect(body).toMatchObject({ event: "order.accepted", total: 9800, table: { label: "4" } });
  });
});
