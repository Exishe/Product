"use client";

import { clsx } from "clsx";
import {
  Banknote,
  BellRing,
  CircleDashed,
  ClipboardList,
  CreditCard,
  HandPlatter,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { areaLayout, tileAge, type FloorArea, type FloorTable, type TableState } from "./floor-model";

// Every table state has a colour, an icon and a word (ADR-054), so it never
// relies on colour alone. A free table is an empty outline on the floor; a
// seated one a white card with a green edge (5.6:1 on the staff grey); amber
// is a new order (ADR-056's one warm accent), red a call, ink the bill.
const STATE_CLASS: Record<TableState, string> = {
  free: "border-dashed border-line-strong bg-transparent text-staff-label2 shadow-none",
  busy: "border-tarragon bg-white text-tarragon shadow-[var(--shadow-soft)]",
  new: "border-amber-text bg-amber text-ink shadow-[var(--shadow-soft)]",
  ready: "border-tarragon bg-tarragon text-white shadow-[var(--shadow-soft)]",
  call: "border-[3px] border-pomegranate bg-pom-tint text-pomegranate shadow-[var(--shadow-soft)]",
  bill: "border-ink bg-ink text-white shadow-[var(--shadow-soft)]",
};
const NUMBER_CLASS: Record<TableState, string> = {
  free: "text-ink",
  busy: "text-ink",
  new: "text-ink",
  ready: "text-white",
  call: "text-ink",
  bill: "text-white",
};
export const STATE_ICON: Record<TableState, LucideIcon> = {
  free: CircleDashed,
  busy: Users,
  new: ClipboardList,
  ready: HandPlatter,
  call: BellRing,
  bill: Receipt,
};
// The small round badge used in the legend and the Orders and Calls lists.
export const STATE_BADGE: Record<TableState, string> = {
  free: "text-staff-label2 outline-2 outline-dashed -outline-offset-2 outline-line-strong",
  busy: "bg-white text-tarragon ring-2 ring-inset ring-tarragon",
  new: "bg-amber text-ink",
  ready: "bg-tarragon text-white",
  call: "bg-pomegranate text-white",
  bill: "bg-ink text-white",
};
export const STATES: readonly TableState[] = ["free", "busy", "new", "ready", "call", "bill"];

// The state's icon; a bill shows how the guest wants to pay when they said so.
export function StateIcon({
  state,
  payment,
  className,
}: {
  state: TableState;
  payment?: "card" | "cash" | null;
  className?: string;
}) {
  if (state === "bill" && payment === "card") return <CreditCard aria-hidden="true" className={className} />;
  if (state === "bill" && payment === "cash") return <Banknote aria-hidden="true" className={className} />;
  const Icon = STATE_ICON[state];
  return <Icon aria-hidden="true" className={className} />;
}

// Areas as a segmented control (HIG): one row, scrolls sideways when long.
export function AreaTabs({
  areas,
  current,
  onPick,
}: {
  areas: readonly FloorArea[];
  current: string | null;
  onPick: (id: string | null) => void;
}) {
  const t = useTranslations("waiter");
  if (areas.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={t("areas")}
      className="bg-staff-fill flex max-w-full gap-0.5 overflow-x-auto rounded-xl p-0.5"
    >
      {areas.map((a) => (
        <button
          key={a.id ?? "none"}
          type="button"
          aria-pressed={current === a.id}
          onClick={() => onPick(a.id)}
          className="text-staff-label2 aria-pressed:text-ink min-h-11 min-w-0 flex-1 rounded-[10px] px-4 text-[0.9375rem] font-semibold whitespace-nowrap aria-pressed:bg-white aria-pressed:shadow-sm"
        >
          {a.name ?? t("otherArea")}
        </button>
      ))}
    </div>
  );
}

export function FloorMap({
  tables,
  selected,
  onSelect,
  now,
  pendingTables,
}: {
  tables: readonly FloorTable[];
  selected: string | null;
  onSelect: (id: string) => void;
  now: number;
  /** Tables with taps still waiting in this device's outbox. */
  pendingTables?: ReadonlySet<string>;
}) {
  const t = useTranslations("waiter");
  const layout = areaLayout(tables);
  return (
    <section aria-label={t("floorMap")} className="grid content-start gap-4">
      <div className={clsx(layout.placed && "overflow-x-auto")}>
        <div
          data-testid="floor"
          className={clsx("grid gap-3", !layout.placed && "grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]")}
          style={
            layout.placed
              ? {
                  gridTemplateColumns: `repeat(${layout.columns}, minmax(4.75rem, 10rem))`,
                  gridTemplateRows: `repeat(${layout.rows}, auto)`,
                }
              : undefined
          }
        >
          {tables.map((table) => (
            <TableButton
              key={table.id}
              table={table}
              wide={layout.placed ? layout.wide.has(table.id) : table.shape === "rect"}
              selected={selected === table.id}
              onSelect={onSelect}
              now={now}
              pending={pendingTables?.has(table.id) ?? false}
            />
          ))}
        </div>
      </div>
      <section aria-labelledby="legend-title" className="grid gap-2">
        <h2 id="legend-title" className="text-staff-label2 m-0 px-1 text-[0.8125rem] font-semibold">
          {t("legend")}
        </h2>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-2 rounded-2xl bg-white p-3">
          {STATES.map((s) => {
            return (
              <li key={s} className="flex min-w-0 items-center gap-2 text-[0.9375rem]">
                <span
                  aria-hidden="true"
                  className={clsx("grid size-7 shrink-0 place-items-center rounded-full", STATE_BADGE[s])}
                >
                  <StateIcon state={s} className="size-4" />
                </span>
                <span className="min-w-0">{t(`state.${s}`)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}

function TableButton({
  table,
  wide,
  selected,
  onSelect,
  now,
  pending,
}: {
  table: FloorTable;
  wide: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  now: number;
  pending: boolean;
}) {
  const t = useTranslations("waiter");
  const state =
    table.state === "bill" && table.bill?.payment
      ? t(table.bill.payment === "card" ? "state.billCard" : "state.billCash")
      : t(`state.${table.state}`);
  // How long the most urgent thing has waited; a seated table shows how long
  // it has been open, or that it has gone quiet (no order, call or plate for 20 min).
  const age = tileAge(table, now);
  const minutes = age?.minutes ?? (table.state === "busy" ? table.openMinutes : null);
  const duration = (m: number) =>
    m >= 60
      ? t("hoursShort", { hours: Math.floor(m / 60), minutes: m % 60 })
      : t("minutesShort", { minutes: m });
  return (
    <button
      type="button"
      id={`table-${table.id}`}
      data-testid="table"
      data-table={table.label}
      data-state={table.state}
      data-quiet={age?.kind === "quiet" ? "" : undefined}
      data-pending={pending ? "" : undefined}
      aria-pressed={selected}
      onClick={() => onSelect(table.id)}
      style={table.pos ? { gridColumnStart: table.pos.x + 1, gridRowStart: table.pos.y + 1 } : undefined}
      className={clsx(
        "relative flex min-h-28 min-w-0 flex-col items-center justify-center gap-1 border-2 px-2 pt-5 pb-2 text-center transition-colors duration-150 motion-reduce:transition-none",
        table.shape === "round" ? "rounded-full sm:aspect-square" : "rounded-2xl",
        wide && "col-span-2",
        STATE_CLASS[table.state],
        selected && "outline-ink outline-[3px] outline-offset-[3px] outline-solid",
      )}
    >
      {/* The name comes from what the button shows (axe: label-content-name-mismatch). */}
      <b
        className={clsx(
          "num max-w-full leading-none font-bold [overflow-wrap:anywhere]",
          table.label.length > 4 ? "text-xl" : "text-[1.875rem]",
          NUMBER_CLASS[table.state],
        )}
      >
        {t.rich("tableName", {
          label: table.label,
          hidden: (chunks) => <span className="sr-only">{chunks}</span>,
        })}
      </b>
      {/* The icon sits in the corner (inside the circle on round tables), so the word keeps the whole width. */}
      <StateIcon
        state={table.state}
        payment={table.bill?.payment}
        className={clsx(
          "absolute size-5",
          table.shape === "round" ? "top-3 left-1/2 -translate-x-1/2" : "top-2.5 left-2.5",
        )}
      />
      <span className="max-w-full text-[0.8125rem] leading-tight font-semibold break-words">{state}</span>
      {age?.kind === "quiet" ? (
        <span className="num text-amber-text text-[0.8125rem] leading-tight font-semibold">
          {t("quiet", { time: duration(age.minutes) })}
        </span>
      ) : (
        minutes !== null && <span className="num text-[0.8125rem] leading-tight">{duration(minutes)}</span>
      )}
      {/* A tap on this table still waits in the outbox (header «Չուղարկված»). */}
      {pending && (
        <span
          aria-hidden="true"
          data-testid="pending-dot"
          className={clsx(
            "bg-amber ring-ink absolute size-3 rounded-full ring-2",
            table.shape === "round" ? "top-[16%] right-[16%]" : "top-2.5 right-2.5",
          )}
        />
      )}
    </button>
  );
}
