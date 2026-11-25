"use client";

import { clsx } from "clsx";
import {
  Banknote,
  BellRing,
  CircleDashed,
  CircleHelp,
  ClipboardList,
  CreditCard,
  HandPlatter,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { areaLayout, tileAge, type FloorArea, type FloorTable, type TableState } from "./floor-model";

// Every table state has a colour, an icon and a word (ADR-054), so it never
// relies on colour alone. A free table is an empty dashed outline; every other
// table is the same white tile, and its state is the small round badge the
// legend and the lists use (amber a new order, green a plate, ink the bill).
// Only a call, the one thing that cannot wait, fills the whole tile red.
const STATE_CLASS: Record<TableState, string> = {
  free: "border-dashed border-line-strong bg-transparent text-staff-label2 shadow-none",
  busy: "border-transparent bg-white text-staff-label2 shadow-[var(--shadow-soft)]",
  new: "border-transparent bg-white text-ink shadow-[var(--shadow-soft)]",
  ready: "border-transparent bg-white text-tarragon shadow-[var(--shadow-soft)]",
  call: "border-pomegranate bg-pomegranate text-white shadow-[var(--shadow-soft)]",
  bill: "border-transparent bg-white text-ink shadow-[var(--shadow-soft)]",
};
const NUMBER_CLASS: Record<TableState, string> = {
  free: "text-ink",
  busy: "text-ink",
  new: "text-ink",
  ready: "text-ink",
  call: "text-white",
  bill: "text-ink",
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
      className="bg-staff-fill flex max-w-full gap-0.5 overflow-x-auto rounded-xl p-0.5 md:justify-self-start"
    >
      {areas.map((a) => (
        <button
          key={a.id ?? "none"}
          type="button"
          aria-pressed={current === a.id}
          onClick={() => onPick(a.id)}
          className="text-staff-label2 aria-pressed:text-ink min-h-11 min-w-0 flex-1 rounded-[10px] px-4 md:flex-none md:px-5 text-[0.9375rem] font-semibold whitespace-nowrap aria-pressed:bg-white aria-pressed:shadow-sm"
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
  const [legendOpen, setLegendOpen] = useState(false);
  const legendId = useId();
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
      <div className="grid gap-2">
        <button
          type="button"
          aria-expanded={legendOpen}
          aria-controls={legendId}
          onClick={() => setLegendOpen((v) => !v)}
          className="text-staff-label2 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-xl px-2 text-[0.8125rem] font-semibold"
        >
          <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
          {t("legend")}
        </button>
        <ul
          id={legendId}
          hidden={!legendOpen}
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-2 rounded-2xl bg-white p-3 [&[hidden]]:hidden"
        >
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
      </div>
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
        "relative flex min-h-28 min-w-0 flex-col items-center justify-center gap-1 border-2 px-2 py-2.5 text-center transition-colors duration-150 motion-reduce:transition-none",
        // A round table is a pill as tall as its badge and three lines: a
        // circle where the column is square enough, an oval where it isn't.
        table.shape === "round" ? "rounded-full py-4" : "rounded-2xl",
        wide && "col-span-2",
        STATE_CLASS[table.state],
        selected && "outline-ink outline-[3px] outline-offset-[3px] outline-solid",
      )}
    >
      {/* The state's badge, in the flow above the number so it never covers it. */}
      <span
        aria-hidden="true"
        className={clsx(
          "grid size-7 shrink-0 place-items-center rounded-full",
          table.state === "call" ? "text-pomegranate bg-white" : STATE_BADGE[table.state],
        )}
      >
        <StateIcon state={table.state} payment={table.bill?.payment} className="size-4" />
      </span>
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
      <span className="max-w-full text-[0.8125rem] leading-tight font-semibold break-words">{state}</span>
      {age?.kind === "quiet" ? (
        <span
          className={clsx(
            "num text-[0.8125rem] leading-tight font-semibold",
            table.state === "call" ? "text-white" : "text-amber-text",
          )}
        >
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
            table.shape === "round" ? "top-[14%] right-[18%]" : "top-2.5 right-2.5",
          )}
        />
      )}
    </button>
  );
}
