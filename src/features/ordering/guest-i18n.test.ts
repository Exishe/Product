import { describe, expect, it } from "vitest";
import hy from "../../../messages/hy.json";
import en from "../../../messages/en.json";
import ru from "../../../messages/ru.json";
import { createT, formatMessage } from "./guest-i18n";

describe("formatMessage", () => {
  it("fills placeholders", () => {
    expect(formatMessage("Ավելացնել՝ {name}", { name: "Տոլմա" }, "hy")).toBe("Ավելացնել՝ Տոլմա");
    expect(formatMessage("Stays {missing}", {}, "en")).toBe("Stays {missing}");
  });

  it("picks plural forms by the language's rules", () => {
    const ruItems = ru.guest.menu.items;
    expect([1, 2, 5, 11, 21, 22].map((n) => formatMessage(ruItems, { count: n }, "ru"))).toEqual([
      "1 блюдо",
      "2 блюда",
      "5 блюд",
      "11 блюд",
      "21 блюдо",
      "22 блюда",
    ]);
    expect([1, 3].map((n) => formatMessage(hy.guest.menu.items, { count: n }, "hy"))).toEqual(["1 ուտեստ", "3 ուտեստ"]);
    expect([1, 3].map((n) => formatMessage(en.guest.menu.items, { count: n }, "en"))).toEqual(["1 item", "3 items"]);
  });

  it("handles a plural inside a sentence and exact matches", () => {
    const busy = ru.guest.menu.kitchenBusy;
    expect(formatMessage(busy, { minutes: 45 }, "ru")).toBe("Кухня сейчас загружена. Заказ будет готов примерно через 45 минут.");
    expect(formatMessage("{n, plural, =0 {none} one {# one} other {# many}}", { n: 0 }, "en")).toBe("none");
  });
});

describe("createT", () => {
  it("looks up dotted keys in the guest messages", () => {
    const t = createT(en.guest, "en");
    expect(t("cart.send")).toBe("Send to the kitchen");
    expect(t("menu.add", { name: "Tolma" })).toBe("Add Tolma");
    expect(t("no.such.key")).toBe("no.such.key");
  });
});
