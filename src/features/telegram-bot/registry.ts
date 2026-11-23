import { t, type BotLocale, type TextKey } from "./texts";

// The action registry, presentation side (ADR-069). The rules live in Postgres:
// the same ids are rows of private.bot_actions, with bot_prepare_<id>,
// bot_apply_<id> and bot_undo_<id> beside them. Here an action only needs
//   label    the main-menu button (a TextKey)
//   confirm  the preview text, from the facts bot_prepare_<id> returned
//   done     the result text, from the change bot_apply_<id> returned
//   describe one line for history and undo, from the same change
// An action with none of the three functions shows "coming soon".

export type Change = { label?: string; old?: Record<string, unknown> | null; new?: Record<string, unknown> | null };
type Vars = Record<string, unknown>;

export type BotAction = {
  label: TextKey;
  // Read-only action: the screen text from the facts bot_read_<id> returned. No confirm, no history.
  read?: (facts: Vars, l: BotLocale) => string;
  confirm?: (facts: Vars, l: BotLocale) => string;
  done?: (change: Change, l: BotLocale) => string;
  describe?: (change: Change, l: BotLocale) => string;
};

const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

// 1234567 -> "1 234 567" with non-breaking spaces, so Telegram never wraps inside a number.
export function money(v: unknown): string {
  const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

export function reportText(f: Vars, l: BotLocale): string {
  const orders = Number(f.orders) || 0;
  const head = t(l, "report_title", { date: s(f.date) });
  if (orders === 0) return [head, t(l, "report_none")].join("\n");
  const top = Array.isArray(f.top) ? (f.top as { name?: unknown; qty?: unknown }[]) : [];
  return [
    head,
    t(l, "report_orders", { orders }),
    t(l, "report_revenue", { amount: money(f.revenue) }),
    t(l, "report_avg", { amount: money(f.avg_bill) }),
    ...(top.length ? ["", t(l, "report_top"), ...top.map((d, i) => `${i + 1}. ${s(d.name)} × ${s(d.qty)}`)] : []),
  ].join("\n");
}

function pauseText(kind: "done" | "desc", change: Change, l: BotLocale): string {
  const n = change.new ?? {};
  if (n.paused !== true) return t(l, `${kind}_resume`);
  return n.until_local
    ? t(l, `${kind}_pause_min`, { until: s(n.until_local) })
    : t(l, `${kind}_pause_inf`);
}

export const registry = {
  sold_out: {
    label: "a_sold_out",
    confirm: (f, l) => t(l, f.to_sold_out ? "confirm_sold_out_on" : "confirm_sold_out_off", { item: s(f.item) }),
    done: (c, l) => t(l, c.new?.sold_out ? "done_sold_out_on" : "done_sold_out_off", { label: c.label ?? "" }),
    describe: (c, l) => t(l, c.new?.sold_out ? "desc_sold_out_on" : "desc_sold_out_off", { label: c.label ?? "" }),
  },
  price: {
    label: "a_price",
    confirm: (f, l) => t(l, "confirm_price", { item: s(f.item), old: s(f.old), new: s(f.new) }),
    done: (c, l) => t(l, "done_price", { label: c.label ?? "", new: s(c.new?.price) }),
    describe: (c, l) => t(l, "desc_price", { label: c.label ?? "", old: s(c.old?.price), new: s(c.new?.price) }),
  },
  hide: {
    label: "a_hide",
    confirm: (f, l) => t(l, f.to_visible ? "confirm_hide_on" : "confirm_hide_off", { item: s(f.item) }),
    done: (c, l) => t(l, c.new?.visible ? "done_hide_on" : "done_hide_off", { label: c.label ?? "" }),
    describe: (c, l) => t(l, c.new?.visible ? "desc_hide_on" : "desc_hide_off", { label: c.label ?? "" }),
  },
  add_item: {
    label: "a_add_item",
    confirm: (f, l) => t(l, f.photo ? "confirm_add_item_photo" : "confirm_add_item", { item: s(f.item), price: money(f.price), category: s(f.category) }),
    done: (c, l) => t(l, "done_add_item", { label: c.label ?? "" }),
    describe: (c, l) => t(l, c.new?.created ? "desc_add_item" : "desc_add_item_undo", { label: c.label ?? "" }),
  },
  category: {
    label: "a_category",
    confirm: (f, l) =>
      t(l, f.to_active ? "confirm_category_on" : "confirm_category_off", { category: s(f.category), count: s(f.items) || "0" }),
    done: (c, l) => t(l, c.new?.active ? "done_category_on" : "done_category_off", { label: c.label ?? "" }),
    describe: (c, l) => t(l, c.new?.active ? "desc_category_on" : "desc_category_off", { label: c.label ?? "" }),
  },
  promo: {
    label: "a_promo",
    confirm: (f, l) =>
      t(l, !f.to_on ? "confirm_promo_off" : f.live_after ? "confirm_promo_on" : "confirm_promo_on_waiting", { promo: s(f.promo) }),
    done: (c, l) => t(l, !c.new?.on ? "done_promo_off" : c.new?.live ? "done_promo_on" : "done_promo_on_waiting", { label: c.label ?? "" }),
    describe: (c, l) => t(l, c.new?.on ? "desc_promo_on" : "desc_promo_off", { label: c.label ?? "" }),
  },
  pause: {
    label: "a_pause",
    confirm: (f, l) =>
      f.choice === "resume"
        ? t(l, "confirm_resume")
        : f.choice === "inf"
          ? t(l, "confirm_pause_inf")
          : t(l, "confirm_pause_min", { minutes: s(f.choice) }),
    done: (c, l) => pauseText("done", c, l),
    describe: (c, l) => pauseText("desc", c, l),
  },
  close_kitchen: {
    label: "a_close_kitchen",
    confirm: (_f, l) => t(l, "confirm_close_kitchen"),
    done: (_c, l) => t(l, "done_close_kitchen"),
    describe: (_c, l) => t(l, "desc_close_kitchen"),
  },
  report: { label: "a_report", read: reportText },
  help: { label: "a_help" },
} as const satisfies Record<string, BotAction>;

export type ActionId = keyof typeof registry;
// Menu order = this order = private.bot_actions.sort.
export const ACTION_IDS = Object.keys(registry) as ActionId[];

export function actionOf(id: string): BotAction | undefined {
  return Object.hasOwn(registry, id) ? registry[id as ActionId] : undefined;
}
