import { clsx } from "clsx";

// The owner admin's controls (ADR-055): the waiter app's HIG language
// (ADR-054) on the neutral staff greys. one filled black button per group is
// the main action; the others are white or grey; red tint only for what removes
// something. Every control is at least 44 px tall (48 px for buttons).
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[1.0625rem] leading-tight font-semibold disabled:cursor-not-allowed aria-disabled:cursor-not-allowed [&_svg]:size-5 [&_svg]:shrink-0";

const kinds = {
  primary: "bg-ink text-white disabled:bg-staff-fill disabled:text-staff-label2",
  // On the white content column (ADR-094) a secondary button is an outline,
  // not a floating white pill: the 3.4:1 field edge, drawn inside.
  secondary:
    "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-staff-field)] disabled:bg-staff-fill disabled:text-staff-label2 disabled:shadow-none",
  // One secondary style on the white column: "tinted" now draws the same
  // outline, so a grey-filled pill never sits next to an outlined one.
  tinted:
    "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-staff-field)] disabled:bg-staff-fill disabled:text-staff-label2 disabled:shadow-none",
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

// Text fields and pickers: white, a 3.4:1 border, 48 px tall. Keyboard focus
// thickens the field's own edge to 2 px ink instead of drawing a second ring
// around it; a field marked aria-invalid gets a red edge.
export const field =
  "w-full min-w-0 rounded-xl border border-staff-field bg-white px-3 text-[1.0625rem] text-ink placeholder:text-staff-label2 disabled:bg-staff-fill disabled:text-staff-label2 focus-visible:border-ink focus-visible:outline-2 focus-visible:-outline-offset-1 aria-invalid:border-pomegranate aria-invalid:outline-pomegranate";
export const input = clsx(field, "h-12");
export const fieldLabel = "text-label font-semibold text-staff-label2";

// A message inside a form (an error from the server, a notice): one shape,
// 12 px corners like the fields, a 16 px icon on the first line.
export const alert = {
  base: "m-0 flex items-start gap-2 rounded-xl px-3 py-2.5 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
  error: "bg-pom-tint text-pomegranate",
  notice: "bg-amber-tint text-ink [&_svg]:text-amber-text",
};

// One heading scale (ADR-055, on the ADR-094 type scale): the page title (h1),
// a section title (20 px semibold) and a title inside a group (17 px semibold),
// so a group never shouts louder than the section it sits in.
export const sectionTitle = "m-0 text-heading font-semibold break-words";
export const cardTitle = "m-0 text-name font-semibold break-words";

// A quiet text action: 16 px semibold ink with its icon or chevron, no fill,
// no shadow, 44 px tall. Underlined only on hover and keyboard focus (an app,
// not a 2010 web link).
export const textAction = (tone: "ink" | "danger" = "ink", extra?: string) =>
  clsx(
    "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-body font-semibold whitespace-nowrap underline-offset-4 hover:underline focus-visible:underline disabled:cursor-not-allowed disabled:text-staff-label2 disabled:no-underline [&_svg]:size-[1.125rem] [&_svg]:shrink-0",
    tone === "danger" ? "text-pomegranate" : "text-ink",
    extra,
  );

// Grouped content (ADR-094): no box at all. The group sits on the white
// column with the page's left edge, split from the next one by space.
export const card = "flex flex-col gap-4";

// A group with its own heading (a self-made Section): the heading block ends
// in a hairline and the content follows on the page.
export const group = "flex min-w-0 flex-col gap-4";
export const groupHead = "border-staff-sep flex flex-col gap-1 border-b pb-3";

export const chip = {
  base: "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label leading-6 font-semibold [&_svg]:size-4 [&_svg]:shrink-0",
  plain: "bg-staff-fill text-staff-label2",
  ok: "bg-tarragon-tint text-tarragon",
  wait: "bg-amber-tint text-amber-text",
  alert: "bg-pom-tint text-pomegranate",
};

// Checkboxes and radios: native, tinted, 24 px.
export const check = "size-6 shrink-0 accent-ink";

// Lists (people, devices, logins, tables): 64 px rows on the page split by
// hairlines, text on the page's left edge. The three columns line up across
// every list on a page: who, status, actions.
export const list = {
  wrap: "m-0 flex list-none flex-col p-0",
  item: "border-staff-sep flex flex-col gap-3 border-b py-3 last:border-0",
  row: "flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 sm:grid sm:grid-cols-[minmax(0,1fr)_13rem_minmax(0,16rem)] sm:gap-x-4",
  who: "flex min-w-0 flex-1 items-center gap-3",
  avatar:
    "bg-staff-fill text-ink grid size-10 shrink-0 place-items-center rounded-full text-[0.9375rem] font-semibold [&_svg]:size-5",
  name: "text-name leading-snug font-semibold break-words",
  sub: "text-staff-label2 text-label leading-snug",
  status: "text-staff-label2 flex min-w-0 flex-col gap-0.5 text-label",
  actions: "ml-auto flex flex-wrap items-center justify-end gap-1 sm:ml-0",
};

// Shared table styles (a shadcn/ui-style data table in our tokens).
export const table = {
  wrap: "min-w-0 overflow-x-auto",
  table: "w-full border-collapse text-left text-label",
  head: "border-b border-staff-sep text-label font-semibold text-staff-label2",
  // The first column starts on the page's edge, like every heading above it.
  th: "px-3 py-2.5 font-semibold first:pl-0 last:pr-0",
  row: "border-b border-staff-sep last:border-0",
  td: "px-3 py-3 align-middle first:pl-0 last:pr-0",
};
