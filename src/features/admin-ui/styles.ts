import { clsx } from "clsx";

// The owner admin's controls (ADR-055): the waiter app's HIG language
// (ADR-054) on the neutral staff greys. one filled black button per group is
// the main action; the others are white or grey; red tint only for what removes
// something. Every control is at least 44 px tall (48 px for buttons).
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[1.0625rem] leading-tight font-semibold disabled:cursor-not-allowed aria-disabled:cursor-not-allowed [&_svg]:size-5 [&_svg]:shrink-0";

const kinds = {
  primary: "bg-ink text-white disabled:bg-staff-fill disabled:text-staff-label2",
  secondary:
    "bg-white text-ink shadow-[var(--shadow-soft)] disabled:bg-staff-fill disabled:text-staff-label2 disabled:shadow-none",
  tinted: "bg-staff-fill text-ink disabled:bg-staff-fill disabled:text-staff-label2",
  danger: "bg-pom-tint text-pomegranate disabled:bg-staff-fill disabled:text-staff-label2",
  destructive: "bg-pomegranate text-white disabled:bg-staff-fill disabled:text-staff-label2",
  plain: "px-2 text-ink underline underline-offset-4 disabled:text-staff-label2",
} as const;

export type ButtonKind = keyof typeof kinds;

export const button = (kind: ButtonKind, extra?: string) => clsx(base, kinds[kind], extra);

// A square icon-only button (needs an aria-label).
export const iconButton = (extra?: string) =>
  clsx(
    "inline-grid size-11 shrink-0 place-items-center rounded-full text-staff-label2 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-5",
    extra,
  );

// Text fields and pickers: white, a 3.4:1 border, 48 px tall.
export const field =
  "w-full min-w-0 rounded-xl border border-staff-field bg-white px-3 text-[1.0625rem] text-ink placeholder:text-staff-label2 disabled:bg-staff-fill disabled:text-staff-label2";
export const input = clsx(field, "h-12");
export const fieldLabel = "text-[0.9375rem] font-semibold text-staff-label2";

// One heading scale (ADR-055): the page title (h1), a section title above a
// card (Section, 19 px semibold), and a title inside a card (17 px semibold),
// so a card never shouts louder than the section it sits in.
export const sectionTitle = "m-0 text-[1.1875rem] leading-tight font-semibold break-words";
export const cardTitle = "m-0 text-[1.0625rem] leading-snug font-semibold break-words";

// A quiet text action inside a list row: no fill, no shadow, 44 px tall.
export const textAction = (tone: "ink" | "danger" = "ink", extra?: string) =>
  clsx(
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[0.9375rem] font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:text-staff-label2 [&_svg]:size-4 [&_svg]:shrink-0",
    tone === "danger" ? "text-pomegranate" : "text-ink",
    extra,
  );

// Grouped content on the grey page: white, rounded, no border (iOS inset grouped).
export const card = "rounded-2xl bg-white p-4 sm:p-5"; // floats on --shadow-soft (globals.css, ADR-056)

export const chip = {
  base: "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.8125rem] leading-5 font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0",
  plain: "bg-staff-fill text-staff-label2",
  ok: "bg-tarragon-tint text-tarragon",
  wait: "bg-amber-tint text-amber-text",
  alert: "bg-pom-tint text-pomegranate",
};

// Checkboxes and radios: native, tinted, 24 px.
export const check = "size-6 shrink-0 accent-ink";

// White grouped lists (people, devices, logins, tables): 64 px rows split by
// hairlines. The three columns line up across every list on a page: who,
// status, actions.
export const list = {
  wrap: "m-0 flex list-none flex-col rounded-2xl bg-white p-0",
  item: "border-staff-sep flex flex-col gap-3 border-b px-4 py-3 last:border-0",
  row: "flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 sm:grid sm:grid-cols-[minmax(0,1fr)_13rem_minmax(0,16rem)] sm:gap-x-4",
  who: "flex min-w-0 flex-1 items-center gap-3",
  avatar:
    "bg-staff-fill text-ink grid size-10 shrink-0 place-items-center rounded-full text-[0.9375rem] font-semibold [&_svg]:size-5",
  name: "text-[1.0625rem] leading-snug font-semibold break-words",
  sub: "text-staff-label2 text-[0.9375rem] leading-snug",
  status: "text-staff-label2 flex min-w-0 flex-col gap-0.5 text-[0.9375rem]",
  actions: "ml-auto flex flex-wrap items-center justify-end gap-1 sm:ml-0",
};

// Shared table styles (a shadcn/ui-style data table in our tokens).
export const table = {
  wrap: "min-w-0 overflow-hidden rounded-2xl bg-white",
  table: "w-full border-collapse text-left text-[0.9375rem]",
  head: "border-b border-staff-sep text-[0.8125rem] font-semibold text-staff-label2",
  th: "px-4 py-2.5 font-semibold",
  row: "border-b border-staff-sep last:border-0",
  td: "px-4 py-3 align-middle",
};
