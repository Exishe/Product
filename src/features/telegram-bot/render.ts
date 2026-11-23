import { cb } from "./callbacks";
import { ACTION_IDS, actionOf, type Change } from "./registry";
import { BOT_LOCALES, t, type BotLocale, type TextKey } from "./texts";

// Draws what private.bot_handle decided (a "screen") as one Bot API call, which
// the webhook returns as its HTTP answer: editMessageText for a button press
// (the message turns into the next screen), sendMessage for typed text.

type Row = { id: string; label: string; off?: boolean };
type Ctx = Record<string, unknown>;
export type Screen =
  | { type: "menu" }
  | { type: "language" }
  | { type: "soon"; action: string }
  | { type: "expired" }
  | { type: "failed"; code: string }
  | { type: "pick_category" | "pick_item"; action: string; page: number; has_prev: boolean; has_next: boolean; rows: Row[]; category?: string | null }
  | { type: "choice"; action: string; choices: string[]; context: Ctx }
  | { type: "ask_number" | "bad_number"; action: string; context: Ctx }
  | { type: "confirm"; action: string; token: string; facts: Ctx }
  | { type: "done"; action: string; change: Change }
  | { type: "undo_confirm"; token: string; change: Change & { action: string } }
  | { type: "undo_result"; ok: boolean; change: Change & { action: string } }
  | { type: "nothing_to_undo" }
  | { type: "history"; rows: (Change & { action: string; at: string; undone: boolean; is_undo: boolean })[] }
  | { type: "read"; action: string; facts: Ctx }
  | { type: "help"; contact: string | null };

export type BotEnvelope = { chat_id: number; message_id?: number; locale: BotLocale | null; screen: Screen };
type Button = { text: string; callback_data: string };
type Rendered = { text: string; keyboard: Button[][] };

const MAX_CALLBACK_BYTES = 64;
// Failure codes from the database that have their own sentence; others say "try again".
const FAILED_TEXT: Record<string, TextKey> = {
  not_found: "failed_not_found",
  not_paused: "failed_not_paused",
  has_options: "failed_has_options",
  unchanged: "failed_unchanged",
  already_closed: "failed_already_closed",
  unreviewed_ai: "failed_unreviewed_ai",
};
const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

function describe(action: string, change: Change, l: BotLocale): string {
  if (action === "undo") return t(l, "desc_undo", { label: change.label ?? "" });
  return actionOf(action)?.describe?.(change, l) ?? change.label ?? action;
}

export function renderScreen(screen: Screen, locale: BotLocale | null): Rendered {
  const l = locale ?? "hy";
  const btn = (text: string, data: string): Button => ({ text, callback_data: data });
  const menuRow = [btn(t(l, "menu_btn"), cb.menu())];
  const navRow = [btn(t(l, "back"), cb.back()), btn(t(l, "cancel"), cb.cancel())];

  switch (screen.type) {
    case "language":
      return {
        text: t(null, "lang_prompt"),
        keyboard: [BOT_LOCALES.map((x) => btn(t(null, `lang_${x}`), cb.language(x)))],
      };
    case "menu":
      return {
        text: t(l, "menu_title"),
        keyboard: [
          ...ACTION_IDS.map((id) => [btn(t(l, actionOf(id)!.label), cb.action(id))]),
          [btn(t(l, "undo"), cb.undo()), btn(t(l, "history"), cb.history())],
          [btn(t(l, "language"), cb.language("choose"))],
        ],
      };
    case "soon":
      return { text: t(l, "soon"), keyboard: [menuRow] };
    case "expired":
      return { text: t(l, "expired"), keyboard: [menuRow] };
    case "failed": {
      const key = Object.hasOwn(FAILED_TEXT, screen.code) ? FAILED_TEXT[screen.code]! : "failed_invalid";
      return { text: t(l, key), keyboard: [menuRow] };
    }
    case "pick_category":
    case "pick_item": {
      const paging: Button[] = [];
      if (screen.has_prev) paging.push(btn(t(l, "page_prev"), cb.page(screen.page - 1)));
      if (screen.has_next) paging.push(btn(t(l, "page_next"), cb.page(screen.page + 1)));
      const text =
        screen.type === "pick_category"
          ? t(l, "pick_category")
          : screen.category
            ? t(l, "pick_item_in", { category: screen.category })
            : t(l, "pick_item");
      return {
        text,
        keyboard: [...screen.rows.map((r) => [btn(r.off ? t(l, "row_off", { label: r.label }) : r.label, cb.pick(r.id))]), ...(paging.length ? [paging] : []), navRow],
      };
    }
    case "choice": {
      const ctx = screen.context;
      const state = ctx.paused
        ? ctx.until_local
          ? t(l, "pause_on_until", { until: s(ctx.until_local) })
          : t(l, "pause_on_open")
        : "";
      const buttons = screen.choices.map((c) => btn(t(l, `ch_${c}` as "ch_10"), cb.choice(c)));
      const rows: Button[][] = [];
      for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
      return { text: [state, t(l, "choice_pause")].filter(Boolean).join("\n"), keyboard: [...rows, navRow] };
    }
    case "ask_number":
      return { text: t(l, "ask_number"), keyboard: [navRow] };
    case "bad_number":
      return { text: t(l, "bad_number"), keyboard: [navRow] };
    case "confirm":
      return {
        text: actionOf(screen.action)?.confirm?.(screen.facts, l) ?? t(l, "failed_invalid"),
        keyboard: [[btn(`✅ ${t(l, "confirm")}`, cb.confirm(screen.token)), btn(`❌ ${t(l, "cancel")}`, cb.cancel())]],
      };
    case "done":
      return {
        text: `✅ ${actionOf(screen.action)?.done?.(screen.change, l) ?? ""}`.trim(),
        keyboard: [[btn(t(l, "undo"), cb.undo())], menuRow],
      };
    case "undo_confirm":
      return {
        text: t(l, "undo_confirm", { what: describe(screen.change.action, screen.change, l) }),
        keyboard: [[btn(`✅ ${t(l, "confirm")}`, cb.confirm(screen.token)), btn(`❌ ${t(l, "cancel")}`, cb.cancel())]],
      };
    case "undo_result":
      return {
        text: screen.ok
          ? `✅ ${t(l, "undone", { what: describe(screen.change.action, screen.change, l) })}`
          : t(l, "undo_changed"),
        keyboard: [menuRow],
      };
    case "nothing_to_undo":
      return { text: t(l, "nothing_to_undo"), keyboard: [menuRow] };
    case "history": {
      const lines = screen.rows.map((r) => {
        const what = describe(r.is_undo ? "undo" : r.action, r, l);
        return `${r.at}  ${what}${r.undone ? ` (${t(l, "history_undone")})` : ""}`;
      });
      return { text: lines.length ? [t(l, "history_title"), ...lines].join("\n") : t(l, "history_empty"), keyboard: [menuRow] };
    }
    case "read":
      return {
        text: actionOf(screen.action)?.read?.(screen.facts, l) ?? t(l, "failed_invalid"),
        keyboard: [[btn(t(l, "back_to_menu"), cb.menu())]],
      };
    case "help":
      return {
        text: [screen.contact ? t(l, "help_contact", { contact: screen.contact }) : t(l, "help_nocontact"), t(l, "help_howto")].join("\n"),
        keyboard: [menuRow],
      };
    default:
      return { text: t(l, "menu_title"), keyboard: [menuRow] };
  }
}

// The Bot API call for the webhook's answer. Throws if a button's data would be
// refused by Telegram (over 64 bytes), so the mistake shows in tests, not in chats.
export function renderBotReply(env: BotEnvelope): Record<string, unknown> {
  const { text, keyboard } = renderScreen(env.screen, env.locale);
  for (const row of keyboard)
    for (const b of row)
      if (new TextEncoder().encode(b.callback_data).length > MAX_CALLBACK_BYTES) throw new Error("callback_data too long");
  return {
    method: env.message_id ? "editMessageText" : "sendMessage",
    chat_id: env.chat_id,
    ...(env.message_id ? { message_id: env.message_id } : {}),
    text,
    reply_markup: { inline_keyboard: keyboard },
  };
}
