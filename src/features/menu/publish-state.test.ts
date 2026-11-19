import { describe, expect, it } from "vitest";
import { menuHasChanges } from "./publish-state";

const at = "2026-11-18T10:00:00Z";
const before = "2026-11-18T09:00:00Z";
const after = "2026-11-18T11:00:00Z";
const base = {
  publishedAt: at,
  publishedItemCount: 2,
  categories: [{ updated_at: before }],
  items: [
    { updated_at: before, is_active: true },
    { updated_at: before, is_active: true },
  ],
  groups: [{ updated_at: before }],
};

describe("menuHasChanges", () => {
  it("is false when nothing changed since publishing", () => {
    expect(menuHasChanges(base)).toBe(false);
  });

  it("is true when never published", () => {
    expect(menuHasChanges({ ...base, publishedAt: null })).toBe(true);
  });

  it("counts an option group edited after publishing", () => {
    expect(menuHasChanges({ ...base, groups: [{ updated_at: after }] })).toBe(true);
  });

  it("counts a removed dish through the active count", () => {
    expect(
      menuHasChanges({
        ...base,
        items: [
          { updated_at: before, is_active: true },
          { updated_at: before, is_active: false },
        ],
      }),
    ).toBe(true);
  });
});
