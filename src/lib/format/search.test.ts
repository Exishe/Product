import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeForSearch } from "./search";

const key = normalizeForSearch;

describe("normalizeForSearch", () => {
  it("gives khorovats one key in Armenian, Russian and English spellings", () => {
    const k = key("Խորոված");
    expect(key("хоровац")).toBe(k);
    expect(key("khorovats")).toBe(k);
    expect(key("Khorovatz")).toBe(k);
  });

  it("matches tolma, gata and Jermuk across scripts", () => {
    expect(key("Տոլմա")).toBe(key("Толма"));
    expect(key("Толма")).toBe(key("tolma"));
    expect(key("Գաթա")).toBe(key("Гата"));
    expect(key("Ջերմուկ")).toBe(key("Джермук"));
    expect(key("Джермук")).toBe(key("Jermuk"));
  });

  it("matches zhingyalov hats spelled from Armenian and Russian", () => {
    expect(key("Ժենգյալով հաց")).toBe(key("Женгялов хац"));
  });

  it("treats a word-initial Armenian ye and vo like their spoken forms", () => {
    expect(key("Երևան")).toBe(key("Ереван"));
    expect(key("Ереван")).toBe(key("Yerevan"));
    expect(key("Ոսկի")).toBe(key("Voski"));
  });

  it("ignores case, punctuation and extra spaces", () => {
    expect(key("  Գաթա! ")).toBe(key("gata"));
    expect(key("«Ջերմուկ» ջուր")).toBe(key("jermuk jur"));
  });
});

describe("matchesSearch", () => {
  it("finds a dish when the query is part of any of its names", () => {
    const names = ["Հավի խորոված", "Хоровац из курицы", "Chicken khorovats"];
    expect(matchesSearch(names, "khorovats")).toBe(true);
    expect(matchesSearch(names, "хоровац")).toBe(true);
    expect(matchesSearch(names, "курица")).toBe(false);
    expect(matchesSearch(names, "kuri")).toBe(true);
  });

  it("matches everything for an empty query", () => {
    expect(matchesSearch(["Տոլմա"], "   ")).toBe(true);
  });
});
