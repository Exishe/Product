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
  confirm?: (facts: Vars, l: BotLocale) => string;
  done?: (change: Change, l: BotLocale) => string;
  describe?: (change: Change, l: BotLocale) => string;
};

const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

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
  price: { label: "a_price" },
  hide: { label: "a_hide" },
  add_item: { label: "a_add_item" },
  category: { label: "a_category" },
  promo: { label: "a_promo" },
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
  close_kitchen: { label: "a_close_kitchen" },
  report: { label: "a_report" },
  help: { label: "a_help" },
} as const satisfies Record<string, BotAction>;

export type ActionId = keyof typeof registry;
// Menu order = this order = private.bot_actions.sort.
export const ACTION_IDS = Object.keys(registry) as ActionId[];

export function actionOf(id: string): BotAction | undefined {
  return Object.hasOwn(registry, id) ? registry[id as ActionId] : undefined;
}
