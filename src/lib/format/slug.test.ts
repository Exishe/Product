import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("turns an Armenian café name into a Latin web address", () => {
    expect(slugify("Դեմո սրճարան")).toBe("demo-srcharan");
  });

  it("handles Russian and English names", () => {
    expect(slugify("Кафе Ереван")).toBe("kafe-erevan");
    expect(slugify("Café  Central!")).toBe("cafe-central");
  });

  it("is at least 3 characters, as the database requires", () => {
    expect(slugify("Ա")).toMatch(/^[a-z0-9][a-z0-9-]{2,47}$/);
  });

  it("is at most 48 characters and never ends with a hyphen", () => {
    const s = slugify("Շատ երկար անունով սրճարան, որը չի տեղավորվում մեկ տողում և դեռ շարունակվում է");
    expect(s.length).toBeLessThanOrEqual(48);
    expect(s.endsWith("-")).toBe(false);
  });
});
