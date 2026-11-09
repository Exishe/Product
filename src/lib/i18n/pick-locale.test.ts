import { describe, expect, it } from "vitest";
import { pickGuestLocale } from "./pick-locale";

const all = ["hy", "ru", "en"] as const;

describe("pickGuestLocale", () => {
  it("takes the first browser language the café offers", () => {
    expect(pickGuestLocale({ acceptLanguage: "ru-RU,ru;q=0.9,en;q=0.8", offered: all, fallback: "hy" })).toBe("ru");
    expect(pickGuestLocale({ acceptLanguage: "en-GB,en;q=0.9", offered: all, fallback: "hy" })).toBe("en");
    expect(pickGuestLocale({ acceptLanguage: "hy-AM", offered: all, fallback: "en" })).toBe("hy");
  });

  it("honours q weights, not just the order", () => {
    expect(pickGuestLocale({ acceptLanguage: "en;q=0.4, ru;q=0.8", offered: all, fallback: "hy" })).toBe("ru");
    expect(pickGuestLocale({ acceptLanguage: "ru;q=0, en", offered: all, fallback: "hy" })).toBe("en");
  });

  it("skips languages the café doesn't offer", () => {
    expect(pickGuestLocale({ acceptLanguage: "en-US,ru;q=0.5", offered: ["hy", "ru"], fallback: "hy" })).toBe("ru");
    expect(pickGuestLocale({ acceptLanguage: "en-US", offered: ["hy", "ru"], fallback: "hy" })).toBe("hy");
  });

  it("falls back to the café's default for unknown or missing headers", () => {
    expect(pickGuestLocale({ acceptLanguage: "de-DE,fr;q=0.8", offered: all, fallback: "hy" })).toBe("hy");
    expect(pickGuestLocale({ acceptLanguage: null, offered: all, fallback: "ru" })).toBe("ru");
    expect(pickGuestLocale({ acceptLanguage: "*", offered: all, fallback: "hy" })).toBe("hy");
    expect(pickGuestLocale({ acceptLanguage: ";;;,,q=", offered: all, fallback: "hy" })).toBe("hy");
  });

  it("prefers a language the guest picked earlier on this phone", () => {
    expect(pickGuestLocale({ chosen: "en", acceptLanguage: "ru", offered: all, fallback: "hy" })).toBe("en");
    expect(pickGuestLocale({ chosen: "en", acceptLanguage: "ru", offered: ["hy", "ru"], fallback: "hy" })).toBe("ru");
    expect(pickGuestLocale({ chosen: "de", acceptLanguage: null, offered: all, fallback: "hy" })).toBe("hy");
  });

  it("uses an offered language when the default itself isn't offered", () => {
    expect(pickGuestLocale({ acceptLanguage: "de", offered: ["ru", "en"], fallback: "hy" })).toBe("ru");
  });
});
