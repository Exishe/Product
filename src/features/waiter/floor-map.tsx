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
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { formatAmd, formatInteger } from "@/lib/format/money";
import { areaLayout, tileAge, type FloorArea, type FloorTable, type TableState } from "./floor-model";

// Every table state has a colour, an icon and a word (ADR-054), so it never
// relies on colour alone. The state is the tile's fill, as on Toast and
// Poster: a free table is an outline on the page, a seated one white, a new
// order amber, a ready plate green, and a guest calling or asking for the
// bill red (someone is waiting). One shape for all: 112 px, 16 px corners, no
// shadow, so the floor reads as one surface.
const STATE_CLASS: Record<TableState, string> = {
  free: "border-line-strong bg-transparent text-staff-label2",
  busy: "border-transparent bg-white text-staff-label2",
  new: "border-amber bg-amber text-ink",
  ready: "border-tarragon bg-tarragon text-white",
  call: "border-pomegranate bg-pomegranate text-white",
  bill: "border-pomegranate bg-pomegranate text-white",
};
const NUMBER_CLASS: Record<TableState, string> = {
  free: "text-staff-label2",
  busy: "text-ink",
  new: "text-ink",
  ready: "text-white",
  call: "text-white",
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
// The small round badge used in the legend, the Orders and Calls lists and
// the live card: the tile's own fill.
export const STATE_BADGE: Record<TableState, string> = {
  free: "text-staff-label2 ring-1 ring-inset ring-line-strong",
  busy: "bg-white text-ink ring-1 ring-inset ring-staff-sep",
  new: "bg-amber text-ink",
  ready: "bg-tarragon text-white",
  call: "bg-pomegranate text-white",
  bill: "bg-pomegranate text-white",
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
// An area out of sight with a table that needs someone (a call, the bill, a
// new order, a plate) carries the tab bar's red count, so the waiter never
// hunts for the table the call bar counts.
export function AreaTabs({
  areas,
  current,
  onPick,
  waiting,
}: {
  areas: readonly FloorArea[];
  current: string | null;
  onPick: (id: string | null) => void;
  /** Tables that need someone, per area id. */
  waiting?: ReadonlyMap<string | null, number>;
}) {
  const t = useTranslations("waiter");
  if (areas.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={t("areas")}
      className="bg-staff-fill flex max-w-full gap-0.5 overflow-x-auto rounded-xl p-0.5 md:justify-self-start"
    >
      {areas.map((a) => {
        const count = current === a.id ? 0 : (waiting?.get(a.id) ?? 0);
        return (
          <button
            key={a.id ?? "none"}
            type="button"
            data-testid="area-tab"
            aria-pressed={current === a.id}
            onClick={() => onPick(a.id)}
            className="text-staff-label2 aria-pressed:text-ink inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] px-4 text-base font-semibold whitespace-nowrap aria-pressed:bg-white md:flex-none md:px-5"
          >
            {a.name ?? t("otherArea")}
            {count > 0 && (
              <>
                <span
                  aria-hidden="true"
                  data-testid="area-waiting"
                  className="num bg-pomegranate grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.8125rem] leading-none font-bold text-white"
                >
                  {count}
                </span>
                <span className="sr-only">{t("areaNeeds", { count })}</span>
              </>
            )}
          </button>
        );
      })}
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
          className={clsx(
            "grid gap-2 sm:gap-3",
            !layout.placed &&
              "grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] md:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]",
          )}
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
          className="text-staff-label2 -ml-2 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-xl px-2 text-[0.9375rem] font-semibold"
        >
          <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
          {t("legend")}
        </button>
        <ul
          id={legendId}
          hidden={!legendOpen}
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-2 p-0 [&[hidden]]:hidden"
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
  const locale = useLocale() as Locale;
  // The tile shows the state in one short word («Նոր», «Պատրաստ», «Հաշիվ»
  // with the card or cash icon), so it fits one line in a 360 px phone's
  // column; screen readers hear the full words (the panel spells them out too).
  const payment = table.state === "bill" ? (table.bill?.payment ?? null) : null;
  const state = t(`stateShort.${table.state}`);
  const full = payment
    ? t(payment === "card" ? "state.billCard" : "state.billCash")
    : t(`state.${table.state}`);
  const stateFull = full !== state ? full : null;
  // How long the most urgent thing has waited; a seated table shows how long
  // it has been open, or that it has gone quiet (no order, call or plate for 20 min).
  const age = tileAge(table, now);
  const minutes = age?.minutes ?? (table.state === "busy" ? table.openMinutes : null);
  const duration = (m: number) =>
    m >= 60
      ? t("hoursShort", { hours: Math.floor(m / 60), minutes: m % 60 })
      : t("minutesShort", { minutes: m });
  // The open bill, as on Toast: «34 ր · 10 100» on one line where the tile
  // holds it, the money on its own line under the minutes where it does not.
  // A container query picks the width: «34 ր · 10 100» is 89 px at 15 px, so it
  // stays on one line even in a 360 px phone's three columns (94 px inside);
  // a longer pair needs 120 px. No ֏ on the tile; screen readers hear it.
  const totalText = formatInteger(table.total, locale);
  const short = minutes === null || duration(minutes).length + totalText.length <= 10;
  const spokenTotal = ` ${formatAmd(table.total, locale)}`;
  const money = (inline: boolean) =>
    table.state !== "free" && table.total > 0 ? (
      <span
        className={clsx(
          "num inline-flex items-baseline justify-center whitespace-nowrap",
          !inline && "text-[0.9375rem] leading-tight",
          inline && (short ? "@max-[5.75rem]:basis-full" : "@max-[7.5rem]:basis-full"),
        )}
      >
        {inline && (
          <span aria-hidden="true" className={short ? "@max-[5.75rem]:hidden" : "@max-[7.5rem]:hidden"}>
            &nbsp;·&nbsp;
          </span>
        )}
        <span aria-hidden="true">{totalText}</span>
        <span className="sr-only">{spokenTotal}</span>
      </span>
    ) : null;
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
        "@container relative flex h-28 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden border px-1 text-center transition-colors duration-150 motion-reduce:transition-none",
        // A round table is a pill of the same height: a circle where the
        // column is square enough, an oval where it isn't.
        table.shape === "round" ? "rounded-full" : "rounded-[1rem]",
        wide && "col-span-2",
        STATE_CLASS[table.state],
        selected && "outline-ink outline-[3px] outline-offset-[3px] outline-solid",
      )}
    >
      {/* The name comes from what the button shows (axe: label-content-name-mismatch). */}
      <b
        className={clsx(
          "num max-w-full leading-none font-bold [overflow-wrap:anywhere]",
          table.label.length > 4 ? "text-xl" : "text-[2rem]",
          NUMBER_CLASS[table.state],
        )}
      >
        {t.rich("tableName", {
          label: table.label,
          hidden: (chunks) => <span className="sr-only">{chunks}</span>,
        })}
      </b>
      <span className="flex max-w-full min-w-0 items-center justify-center gap-1 text-[0.9375rem] leading-tight font-semibold">
        {payment && <StateIcon state="bill" payment={payment} className="size-4 shrink-0" />}
        <span aria-hidden={stateFull ? "true" : undefined} className="min-w-0 truncate">
          {state}
        </span>
        {stateFull && <span className="sr-only">{stateFull}</span>}
      </span>
      {age?.kind === "quiet" ? (
        <span
          className={clsx(
            "num max-w-full truncate text-[0.9375rem] leading-tight font-semibold",
            table.state === "busy" && "text-amber-text",
          )}
        >
          {t("quiet", { time: duration(age.minutes) })}
        </span>
      ) : (
        minutes !== null && (
          <span className="num flex max-w-full flex-wrap items-baseline justify-center text-[0.9375rem] leading-tight">
            <span className="whitespace-nowrap">{duration(minutes)}</span>
            {money(true)}
          </span>
        )
      )}
      {/* A quiet table keeps its own line for the money. */}
      {age?.kind === "quiet" && money(false)}
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
