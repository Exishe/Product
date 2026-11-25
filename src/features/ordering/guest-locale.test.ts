import { describe, expect, it } from "vitest";
import { chosenLocale, localeCookie, localeOfPath, withLocale } from "./guest-locale";

describe("localeOfPath", () => {
  it("reads the first segment", () => {
    expect(localeOfPath("/ru/m/blanca/main")).toBe("ru");
    expect(localeOfPath("/hy")).toBe("hy");
  });
  it("ignores anything that is not a guest language", () => {
    expect(localeOfPath("/waiter")).toBeNull();
    expect(localeOfPath("/")).toBeNull();
    expect(localeOfPath("/de/m/x")).toBeNull();
  });
});

describe("withLocale", () => {
  it("swaps only the language and keeps the table token and the cart hash", () => {
    expect(withLocale("/hy/m/blanca/main?t=AB_c-1#cart", "ru")).toBe("/ru/m/blanca/main?t=AB_c-1#cart");
    expect(withLocale("/hy/m/blanca/main/order?t=x", "en")).toBe("/en/m/blanca/main/order?t=x");
  });
  it("handles a bare language path and a path with only a hash", () => {
    expect(withLocale("/hy", "en")).toBe("/en");
    expect(withLocale("/hy#cart", "ru")).toBe("/ru#cart");
    expect(withLocale("/hy/", "ru")).toBe("/ru/");
  });
  it("leaves an address without a language alone", () => {
    expect(withLocale("/waiter?x=1", "ru")).toBe("/waiter?x=1");
  });
  it("does not touch a language-looking word later in the path or the query", () => {
    expect(withLocale("/hy/m/ru/main?l=hy", "en")).toBe("/en/m/ru/main?l=hy");
  });
});

describe("chosenLocale", () => {
  it("finds the cookie among others", () => {
    expect(chosenLocale("a=1; NEXT_LOCALE=ru; b=2")).toBe("ru");
    expect(chosenLocale("NEXT_LOCALE=en")).toBe("en");
  });
  it("is null without a valid language", () => {
    expect(chosenLocale("")).toBeNull();
    expect(chosenLocale("NEXT_LOCALE=de")).toBeNull();
    expect(chosenLocale("XNEXT_LOCALE=ru")).toBeNull();
    expect(chosenLocale("NEXT_LOCALE=%E0%A4%A")).toBeNull();
  });
  it("round-trips what the switch writes", () => {
    expect(chosenLocale(localeCookie("hy").split(";")[0] as string)).toBe("hy");
  });
});
