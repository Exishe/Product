// "By time of day" rules of the "Goes well with" editor (ADR-077, ADR-086):
// inside a window of the day (café time zone), on chosen weekdays, suggest a
// kind of dish or one dish whatever the guest added. Pure functions: reading a
// database row, checking a rule before it is saved, and describing weekdays.
// The database checks every rule again (api.save_time_rule).
import { hhmm } from "@/features/availability/window";
import { isItemType, type ItemType } from "./model";

/** At most this many time rules per café (the database enforces it too). */
export const MAX_TIME_RULES = 10;
/** The ordering number of a rule, as the database accepts it. */
export const MAX_SORT = 1000;

export type TimeRule = {
  id: string;
  /** "HH:MM" */
  from: string;
  to: string;
  /** ISO weekdays 1 (Monday) to 7 (Sunday), sorted; null = every day. */
  weekdays: number[] | null;
  /** Exactly one of toType and toItemId is set. */
  toType: ItemType | null;
  toItemId: string | null;
  sort: number;
};

/** What the server action receives and the database function is called with. */
export type TimeRuleInput = {
  id: string | null;
  from: string;
  to: string;
  weekdays: number[] | null;
  toType: ItemType | null;
  toItemId: string | null;
  sort: number;
};

export type TimeRuleError = "times" | "kind" | "dish" | "order";

const TIME = /^\d{2}:\d{2}$/;
const isTime = (v: string): boolean => {
  if (!TIME.test(v)) return false;
  const [h, m] = v.split(":").map(Number) as [number, number];
  return h < 24 && m < 60;
};

/** Days kept as ISO numbers 1 to 7, once each, in order. None or all seven means "every day" (null). */
export function normaliseWeekdays(days: readonly number[] | null | undefined): number[] | null {
  const kept = [...new Set((days ?? []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
  return kept.length === 0 || kept.length === 7 ? null : kept;
}

/** Runs of neighbouring days: [1, 2, 3, 5, 7] becomes [[1, 3], [5, 5], [7, 7]]. Every day gives no runs. */
export function weekdayRuns(days: readonly number[] | null): [number, number][] {
  const list = normaliseWeekdays(days);
  if (!list) return [];
  const runs: [number, number][] = [];
  for (const d of list) {
    const last = runs[runs.length - 1];
    if (last && last[1] === d - 1) last[1] = d;
    else runs.push([d, d]);
  }
  return runs;
}

/** A window that ends earlier on the clock than it starts passes midnight (22:00 to 02:00). */
export const passesMidnight = (from: string, to: string): boolean => isTime(from) && isTime(to) && from > to;

/** The ordering number: empty is 0; anything but a whole number in range is refused (null). */
export function parseSort(text: string): number | null {
  const s = text.trim();
  if (s === "") return 0;
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Math.abs(n) <= MAX_SORT ? n : null;
}

/** The first thing wrong with a rule, or null when it can be saved. */
export function checkTimeRule(r: TimeRuleInput): TimeRuleError | null {
  if (!isTime(r.from) || !isTime(r.to) || r.from === r.to) return "times";
  // A kind OR one dish, never both and never neither.
  if ((r.toType === null) === (r.toItemId === null)) return r.toItemId === null ? "kind" : "dish";
  if (!Number.isInteger(r.sort) || Math.abs(r.sort) > MAX_SORT) return "order";
  return null;
}

/** The form's state: strings and ticks, before they become a rule. */
export type TimeRuleDraft = {
  id: string | null;
  from: string;
  to: string;
  days: number[];
  target: "type" | "dish";
  toType: string;
  toItemId: string;
  order: string;
};

export const emptyDraft = (): TimeRuleDraft => ({
  id: null,
  from: "08:00",
  to: "11:00",
  days: [],
  target: "type",
  toType: "",
  toItemId: "",
  order: "",
});

export const draftFromRule = (r: TimeRule): TimeRuleDraft => ({
  id: r.id,
  from: r.from,
  to: r.to,
  days: r.weekdays ?? [],
  target: r.toItemId ? "dish" : "type",
  toType: r.toType ?? "",
  toItemId: r.toItemId ?? "",
  order: r.sort === 0 ? "" : String(r.sort),
});

/** Turns the form into a rule to save, or says what is missing. */
export function ruleFromDraft(d: TimeRuleDraft): { ok: true; rule: TimeRuleInput } | { ok: false; error: TimeRuleError } {
  const sort = parseSort(d.order);
  if (!isTime(d.from) || !isTime(d.to) || d.from === d.to) return { ok: false, error: "times" };
  if (d.target === "type" && !isItemType(d.toType)) return { ok: false, error: "kind" };
  if (d.target === "dish" && d.toItemId === "") return { ok: false, error: "dish" };
  if (sort === null) return { ok: false, error: "order" };
  return {
    ok: true,
    rule: {
      id: d.id,
      from: d.from,
      to: d.to,
      weekdays: normaliseWeekdays(d.days),
      toType: d.target === "type" && isItemType(d.toType) ? d.toType : null,
      toItemId: d.target === "dish" ? d.toItemId : null,
      sort,
    },
  };
}

/** Reads a row of public.suggestion_time_rules; anything that does not fit gives null. */
export function ruleFromRow(row: unknown): TimeRule | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const from = typeof r.from_time === "string" ? hhmm(r.from_time) : "";
  const to = typeof r.to_time === "string" ? hhmm(r.to_time) : "";
  const toType = isItemType(r.to_type) ? r.to_type : null;
  const toItemId = typeof r.to_item_id === "string" ? r.to_item_id : null;
  if (typeof r.id !== "string" || !isTime(from) || !isTime(to) || (toType === null) === (toItemId === null)) return null;
  return {
    id: r.id,
    from,
    to,
    weekdays: Array.isArray(r.weekdays) ? normaliseWeekdays(r.weekdays.map(Number)) : null,
    toType,
    toItemId,
    sort: typeof r.sort === "number" ? r.sort : 0,
  };
}

/** The order the list shows: the rule's number, then the start of the window, then id (stable). */
export const sortRules = (rules: readonly TimeRule[]): TimeRule[] =>
  [...rules].sort((a, b) => a.sort - b.sort || a.from.localeCompare(b.from) || a.id.localeCompare(b.id));
