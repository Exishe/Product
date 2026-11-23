import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleTelegram } from "@/features/notifications/telegram-handler";
import { CALLBACK_PATTERN, cb } from "./callbacks";
import { ACTION_IDS, actionOf, money, reportText } from "./registry";
import { renderBotReply, renderScreen, type Screen } from "./render";
import { BOT_LOCALES, texts, t } from "./texts";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const l = "en" as const;

describe("dictionary", () => {
  it("has the same keys and the same placeholders in hy, ru and en", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const key of Object.keys(texts.en) as (keyof typeof texts.en)[])
      for (const loc of BOT_LOCALES) {
        expect(texts[loc][key], `${loc}.${key}`).toBeTruthy();
        expect(ph(texts[loc][key]), `${loc}.${key}`).toBe(ph(texts.en[key]));
      }
  });
  it("uses Armenian punctuation, never Latin full stops, in hy", () => {
    for (const [key, v] of Object.entries(texts.hy)) {
      if (key.startsWith("lang_")) continue;
      expect(v, key).not.toMatch(/[Ա-և][.:?!]/);
      expect(v, key).not.toMatch(/["']/);
    }
  });
  it("fills placeholders and leaves unknown ones alone", () => {
    expect(t("en", "confirm_pause_min", { minutes: 20 })).toContain("20 minutes");
    expect(t("en", "pick_item_in")).toContain("{category}");
  });
});

describe("callbacks", () => {
  it("every callback fits Telegram's 64 bytes and the shape the database accepts", () => {
    const all = [cb.menu(), cb.action("close_kitchen"), cb.pick(uuid), cb.choice("resume"), cb.page(12), cb.back(), cb.cancel(),
      cb.confirm("aB3_-xYz"), cb.undo(), cb.history(), cb.language("hy"), cb.language("choose"), cb.skip()];
    for (const c of all) {
      expect(new TextEncoder().encode(c).length).toBeLessThanOrEqual(64);
      expect(c).toMatch(CALLBACK_PATTERN);
    }
  });
});

describe("registry", () => {
  it("lists the same action ids, in the same order, as private.bot_actions", () => {
    const sql = readFileSync("supabase/migrations/20261123140000_telegram_bot_actions.sql", "utf8");
    const block = sql.slice(sql.indexOf("insert into private.bot_actions"), sql.indexOf("-- One pending step"));
    const ids = [...block.matchAll(/\('([a-z_]+)',\s+(\d+),/g)].sort((a, b) => Number(a[2]) - Number(b[2])).map((m) => m[1]);
    expect(ids).toEqual(ACTION_IDS);
  });
  it("ignores unknown ids, including prototype names", () => {
    expect(actionOf("nope")).toBeUndefined();
    expect(actionOf("constructor")).toBeUndefined();
  });
});

describe("screens", () => {
  it("the menu has all ten actions, undo, history and language, in every language", () => {
    for (const loc of BOT_LOCALES) {
      const { keyboard } = renderScreen({ type: "menu" }, loc);
      const data = keyboard.flat().map((b) => b.callback_data);
      expect(data).toEqual([...ACTION_IDS.map((id) => `a:${id}`), "u", "h", "l:choose"]);
      expect(keyboard.flat().every((b) => b.text.length > 0)).toBe(true);
    }
  });
  it("the language screen offers hy, ru, en", () => {
    expect(renderScreen({ type: "language" }, null).keyboard[0]!.map((b) => b.callback_data)).toEqual(["l:hy", "l:ru", "l:en"]);
  });
  it("a pick list has 8 rows, paging and Back/Cancel", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: `${uuid.slice(0, 35)}${i}`, label: `Dish ${i}` }));
    const { keyboard } = renderScreen({ type: "pick_item", action: "sold_out", page: 1, has_prev: true, has_next: true, rows }, l);
    expect(keyboard.slice(0, 8).every((r) => r[0]!.callback_data.startsWith("p:"))).toBe(true);
    expect(keyboard[8]!.map((b) => b.callback_data)).toEqual(["g:0", "g:2"]);
    expect(keyboard[9]!.map((b) => b.callback_data)).toEqual(["b", "x"]);
  });
  it("the preview shows the facts and confirm/cancel carry the token", () => {
    const screen: Screen = { type: "confirm", action: "sold_out", token: "tok_1234", facts: { item: "Cappuccino", to_sold_out: true } };
    const r = renderScreen(screen, l);
    expect(r.text).toContain("Cappuccino");
    expect(r.keyboard[0]!.map((b) => b.callback_data)).toEqual(["k:tok_1234", "x"]);
  });
  it("pause texts: timed, open-ended and resume", () => {
    const done = (n: Record<string, unknown>) => renderScreen({ type: "done", action: "pause", change: { new: n } }, l).text;
    expect(done({ paused: true, until_local: "14:30" })).toContain("14:30");
    expect(done({ paused: true, until_local: null })).toContain("until you resume");
    expect(done({ paused: false })).toContain("on again");
  });
  it("history marks undone changes and undo rows", () => {
    const r = renderScreen({ type: "history", rows: [
      { action: "undo", label: "Cappuccino", at: "23.11 12:00", undone: false, is_undo: true },
      { action: "sold_out", label: "Cappuccino", new: { sold_out: true }, at: "23.11 11:00", undone: true, is_undo: false },
    ] }, l).text;
    expect(r).toContain("Undo: Cappuccino");
    expect(r).toContain("sold out (undone)");
  });
  it("a not-yet-built action shows nothing but the friendly screen", () => {
    expect(renderScreen({ type: "soon", action: "price" }, "ru").text).toBe(texts.ru.soon);
  });
});

describe("section step, hidden rows and read-only screens", () => {
  const f = { date: "23.11", orders: 12, revenue: 1234567, avg_bill: 4100, top: [{ name: "Cappuccino", qty: 9 }, { name: "Khorovats", qty: 4 }] };
  it("formats money with non-breaking spaces and a dash for none", () => {
    expect(money(1234567)).toBe("1\u00a0234\u00a0567");
    expect(money(950)).toBe("950");
    expect(money(null)).toBe("—");
  });
  it("the report lists orders, revenue, average bill and the top dishes, in every language", () => {
    for (const loc of BOT_LOCALES) {
      const text = reportText(f, loc);
      expect(text).toContain("23.11");
      expect(text).toContain("12");
      expect(text).toContain("1\u00a0234\u00a0567");
      expect(text).toContain("1. Cappuccino × 9");
      expect(text).toContain("2. Khorovats × 4");
    }
  });
  it("the report says so when there are no orders, and shows a dash for no paid bills", () => {
    expect(reportText({ date: "23.11", orders: 0, revenue: 0, avg_bill: null, top: [] }, "en")).toContain(texts.en.report_none);
    expect(reportText({ ...f, avg_bill: null }, "en")).toContain("Average bill: — AMD");
  });
  it("a read screen has no confirm and one Back to menu button", () => {
    const r = renderScreen({ type: "read", action: "report", facts: f }, "ru");
    expect(r.keyboard).toEqual([[{ text: texts.ru.back_to_menu, callback_data: "m" }]]);
    expect(r.text).toContain("Cappuccino");
  });
  it("a read screen of an action without a reader falls back to the friendly failure", () => {
    expect(renderScreen({ type: "read", action: "nope", facts: {} }, "en").text).toBe(texts.en.failed_invalid);
  });
  it("a section picker marks sections that are off", () => {
    const rows = [{ id: uuid, label: "Desserts", off: true }, { id: `${uuid.slice(0, 35)}1`, label: "Coffee" }];
    const { keyboard } = renderScreen({ type: "pick_category", action: "category", page: 0, has_prev: false, has_next: false, rows }, "en");
    expect(keyboard[0]![0]!.text).toBe("Desserts (off)");
    expect(keyboard[1]![0]!.text).toBe("Coffee");
    expect(keyboard[0]![0]!.callback_data).toBe(`p:${uuid}`);
  });
  it("category on / off: preview, done and history say which way it went", () => {
    const off = renderScreen({ type: "confirm", action: "category", token: "tok_1234", facts: { category: "Desserts", active_now: true, to_active: false, items: 7 } }, "en").text;
    expect(off).toContain("on now and will be switched off");
    expect(off).toContain("Desserts");
    expect(off).toContain("7");
    const on = renderScreen({ type: "confirm", action: "category", token: "tok_1234", facts: { category: "Desserts", to_active: true, items: 0 } }, "en").text;
    expect(on).toContain("off now and will be switched on");
    expect(renderScreen({ type: "done", action: "category", change: { label: "Desserts", new: { active: false } } }, "en").text).toContain("is off");
    expect(actionOf("category")!.describe!({ label: "Desserts", new: { active: true } }, "en")).toBe("section «Desserts» on");
  });
  it("hide / show previews name the state now and after", () => {
    const hid = renderScreen({ type: "confirm", action: "hide", token: "t", facts: { item: "Soup", visible_now: false, to_visible: true } }, "en").text;
    expect(hid).toContain("hidden now and will be shown");
    const shown = renderScreen({ type: "confirm", action: "hide", token: "t", facts: { item: "Soup", visible_now: true, to_visible: false } }, "en").text;
    expect(shown).toContain("shown on the menu now and will be hidden");
  });
});

describe("migration 20261123170000", () => {
  const sql = readFileSync("supabase/migrations/20261123170000_telegram_bot_engine_ext.sql", "utf8");
  it("revokes execute from clients on every function it creates", () => {
    const created = [...sql.matchAll(/create (?:or replace )?function (private\.\w+)/g)].map((m) => m[1]!);
    const revoke = sql.slice(sql.lastIndexOf("revoke execute on function"));
    for (const fn of created.filter((n) => !/^private\.bot_(call|list|next|handle)$/.test(n))) expect(revoke, fn).toContain(fn);
    for (const fn of ["bot_call", "bot_list", "bot_next", "bot_handle"]) expect(revoke, fn).toContain(`private.${fn}(`);
  });
  it("every definer function pins the search path", () => {
    const fns = sql.split(/create (?:or replace )?function /).slice(1);
    for (const f of fns) expect(f.slice(0, 400), f.slice(0, 40)).toContain("set search_path = ''");
  });
});

describe("add new item and promo on / off", () => {
  const facts = { item: "Cappuccino", category: "Drinks", price: 1800, photo: false };
  it("the Armenian name cannot be skipped, the Russian and English ones and the photo can", () => {
    const hy = renderScreen({ type: "ask_text", action: "add_item", field: "name_hy", optional: false }, "en");
    expect(hy.text).toBe(texts.en.ask_name_hy);
    expect(hy.keyboard.flat().map((b) => b.callback_data)).toEqual(["b", "x"]);
    const ru = renderScreen({ type: "ask_text", action: "add_item", field: "name_ru", optional: true }, "en");
    expect(ru.keyboard.flat().map((b) => b.callback_data)).toEqual(["s", "b", "x"]);
    expect(renderScreen({ type: "ask_text", action: "add_item", field: "name_en", optional: true }, "ru").text).toBe(texts.ru.ask_name_en);
    expect(renderScreen({ type: "ask_photo", action: "add_item", optional: true }, "en").keyboard.flat().map((b) => b.callback_data)).toEqual(["s", "b", "x"]);
  });
  it("a bad name or photo says why and asks again", () => {
    const bad = renderScreen({ type: "bad_text", action: "add_item", field: "name_hy", optional: false }, "en").text;
    expect(bad).toContain(texts.en.bad_text);
    expect(bad).toContain(texts.en.ask_name_hy);
    expect(renderScreen({ type: "bad_photo", action: "add_item" }, "hy").text).toBe(texts.hy.bad_photo);
  });
  it("an unknown field still draws (the Armenian question), never throws", () => {
    expect(renderScreen({ type: "ask_text", action: "x", field: "evil", optional: false }, "en").text).toBe(texts.en.ask_name_hy);
  });
  it("the price question is its own sentence for add_item", () => {
    expect(renderScreen({ type: "ask_number", action: "add_item", context: {} }, "en").text).toBe(texts.en.ask_price);
    expect(renderScreen({ type: "ask_number", action: "price", context: {} }, "en").text).toBe(texts.en.ask_number);
  });
  it("the preview names the dish, price and section; a photo changes the sentence", () => {
    const r = renderScreen({ type: "confirm", action: "add_item", token: "tok_1234", facts }, "en");
    expect(r.text).toBe("Add «Cappuccino», 1\u00a0800 AMD, in «Drinks»? Guests see it right after.");
    expect(r.keyboard[0]!.map((b) => b.callback_data)).toEqual(["k:tok_1234", "x"]);
    expect(renderScreen({ type: "confirm", action: "add_item", token: "t", facts: { ...facts, photo: true } }, "en").text).toContain("photo");
  });
  it("done, history and undo describe an added dish and its removal", () => {
    expect(renderScreen({ type: "done", action: "add_item", change: { label: "Cappuccino", new: { created: true } } }, "en").text).toContain("added to the menu");
    expect(actionOf("add_item")!.describe!({ label: "Cappuccino", old: null, new: { created: true, price: 800 } }, "en")).toBe("item «Cappuccino» added");
    expect(actionOf("add_item")!.describe!({ label: "Cappuccino", old: { created: true }, new: null }, "en")).toBe("item «Cappuccino» removed");
  });
  it("a promo picker marks promos that are on and off", () => {
    const rows = [{ id: uuid, label: "Happy hour", on: true, off: false }, { id: `${uuid.slice(0, 35)}1`, label: "Spring", on: false, off: true }];
    const { keyboard, text } = renderScreen({ type: "pick_promo", action: "promo", page: 0, has_prev: false, has_next: false, rows }, "en");
    expect(text).toBe(texts.en.pick_promo);
    expect(keyboard[0]![0]!.text).toBe("✅ Happy hour");
    expect(keyboard[1]![0]!.text).toBe("Spring (off)");
  });
  it("promo previews and results say which way it goes and whether guests see it", () => {
    const c = (f: Record<string, unknown>) => renderScreen({ type: "confirm", action: "promo", token: "t", facts: { promo: "Happy hour", ...f } }, "en").text;
    expect(c({ to_on: true, live_after: true })).toContain("switched on");
    expect(c({ to_on: true, live_after: false })).toContain("outside its dates");
    expect(c({ to_on: false })).toContain("switched off");
    const d = (n: Record<string, unknown>) => renderScreen({ type: "done", action: "promo", change: { label: "Happy hour", new: n } }, "en").text;
    expect(d({ on: true, live: true })).toContain("is on. Guests see it");
    expect(d({ on: true, live: false })).toContain("do not see it yet");
    expect(d({ on: false })).toContain("is off");
    expect(actionOf("promo")!.describe!({ label: "Happy hour", new: { on: true } }, "ru")).toBe("акция «Happy hour» включена");
  });
  it("the new failure codes have their own sentences", () => {
    expect(renderScreen({ type: "failed", code: "no_section" }, "en").text).toBe(texts.en.failed_no_section);
    expect(renderScreen({ type: "failed", code: "no_promo" }, "ru").text).toBe(texts.ru.failed_no_promo);
  });
});

describe("migration 20261123200000", () => {
  const sql = readFileSync("supabase/migrations/20261123200000_telegram_bot_add_item.sql", "utf8");
  it("revokes execute from clients on every private function it creates", () => {
    const created = [...sql.matchAll(/create (?:or replace )?function (private\.\w+)\(/g)].map((m) => m[1]!);
    const revoke = sql.slice(sql.lastIndexOf("revoke execute on function"));
    expect(created.length).toBeGreaterThan(8);
    for (const fn of created) expect(revoke, fn).toContain(`${fn}(`);
  });
  it("every function pins the search path", () => {
    const fns = sql.split(/create (?:or replace )?function /).slice(1);
    for (const f of fns) expect(f.slice(0, 500), f.slice(0, 40)).toContain("set search_path = ''");
  });
  it("never reads a token or secret key in the app and keeps the photo step off by default", () => {
    expect(sql).not.toMatch(/service_role|secret_key/i);
    expect(sql).toContain("private.secret('bot_photo_enabled') = 'on'");
  });
});

describe("renderBotReply", () => {
  it("edits the message for a button press and sends a new one for text", () => {
    const edit = renderBotReply({ chat_id: 5, message_id: 9, locale: "hy", screen: { type: "menu" } });
    expect(edit).toMatchObject({ method: "editMessageText", chat_id: 5, message_id: 9 });
    const send = renderBotReply({ chat_id: 5, locale: "hy", screen: { type: "menu" } });
    expect(send.method).toBe("sendMessage");
    expect(send).not.toHaveProperty("message_id");
  });
  it("is what the webhook returns for a {bot} answer", async () => {
    const out = await handleTelegram("s3cret", JSON.stringify({ update_id: 1, callback_query: {} }), async () => ({
      data: { bot: { chat_id: 5, message_id: 9, locale: "en", screen: { type: "menu" } } },
      error: null,
    }));
    expect(out.status).toBe(200);
    expect(out.body.method).toBe("editMessageText");
  });
  it("answers 200 with nothing for a screen it cannot draw", async () => {
    const out = await handleTelegram("s3cret", JSON.stringify({ update_id: 1 }), async () => ({
      data: { bot: { chat_id: 5, locale: "en", screen: { type: "pick_item", rows: null } } },
      error: null,
    }));
    expect(out).toEqual({ status: 200, body: {} });
  });
});
