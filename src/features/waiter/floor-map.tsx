"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { areaLayout, type FloorArea, type FloorTable, type TableState } from "./floor-model";

// Colour and word together (screens.md §5), as in design/waiter.html.
const STATE_CLASS: Record<TableState, string> = {
  free: "border-line-strong bg-white text-muted",
  busy: "border-tarragon bg-tarragon-tint text-tarragon",
  new: "border-apricot-deep bg-apricot text-ink motion-safe:animate-[nudge_900ms_ease-out_1]",
  ready: "border-tarragon bg-tarragon text-white",
  call: "border-[3px] border-pomegranate bg-pom-tint text-pomegranate",
  bill: "border-ink bg-ink text-matsoni",
};
const NUMBER_CLASS: Record<TableState, string> = {
  free: "text-ink",
  busy: "text-ink",
  new: "text-ink",
  ready: "text-white",
  call: "text-ink",
  bill: "text-matsoni",
};
const SWATCH: Record<TableState, string> = {
  free: "border-line-strong bg-white",
  busy: "border-tarragon bg-tarragon-tint",
  new: "border-apricot-deep bg-apricot",
  ready: "border-tarragon bg-tarragon",
  call: "border-pomegranate bg-pom-tint",
  bill: "border-ink bg-ink",
};
export const STATES: readonly TableState[] = ["free", "busy", "new", "ready", "call", "bill"];

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
    <div role="group" aria-label={t("areas")} className="flex flex-wrap gap-2">
      {areas.map((a) => (
        <button
          key={a.id ?? "none"}
          type="button"
          aria-pressed={current === a.id}
          onClick={() => onPick(a.id)}
          className="min-h-11 rounded-chip px-4 font-semibold text-muted aria-pressed:bg-ink aria-pressed:text-matsoni"
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
}: {
  tables: readonly FloorTable[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("waiter");
  const layout = areaLayout(tables);
  return (
    <section aria-label={t("floorMap")} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3">
      <div className="min-h-0 overflow-auto rounded-sheet border border-line bg-white p-4">
        <div
          data-testid="floor"
          className={clsx("grid gap-4", !layout.placed && "grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]")}
          style={
            layout.placed
              ? { gridTemplateColumns: `repeat(${layout.columns}, minmax(7rem, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, auto)` }
              : undefined
          }
        >
          {tables.map((table) => (
            <TableButton key={table.id} table={table} selected={selected === table.id} onSelect={onSelect} />
          ))}
        </div>
      </div>
      <ul aria-label={t("legend")} className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-sm text-muted">
        {STATES.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={clsx("size-4 rounded border-2", SWATCH[s])} />
            {t(`state.${s}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TableButton({ table, selected, onSelect }: { table: FloorTable; selected: boolean; onSelect: (id: string) => void }) {
  const t = useTranslations("waiter");
  const state = t(`state.${table.state}`);
  const minutes = (table.state === "busy" || table.state === "bill") && table.openMinutes !== null ? table.openMinutes : null;
  return (
    <button
      type="button"
      data-testid="table"
      data-table={table.label}
      data-state={table.state}
      aria-pressed={selected}
      onClick={() => onSelect(table.id)}
      style={table.pos ? { gridColumnStart: table.pos.x + 1, gridRowStart: table.pos.y + 1 } : undefined}
      className={clsx(
        "flex min-h-28 min-w-0 flex-col items-center justify-center gap-0.5 border-2 p-2 text-center",
        table.shape === "round" ? "aspect-square rounded-full" : "rounded-sheet",
        table.shape === "rect" && "col-span-2",
        STATE_CLASS[table.state],
        selected && "outline-4 outline-offset-[3px] outline-ink outline-solid",
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
        {t.rich("tableName", { label: table.label, hidden: (chunks) => <span className="sr-only">{chunks}</span> })}
      </b>
      <span className="text-sm leading-tight font-semibold">
        {t.rich("tableState", { state, hidden: (chunks) => <span className="sr-only">{chunks}</span> })}
      </span>
      {minutes !== null && <span className="num text-sm">{t("minutesShort", { minutes })}</span>}
    </button>
  );
}
