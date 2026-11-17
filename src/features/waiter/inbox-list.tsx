"use client";

import { clsx } from "clsx";
import { ChevronRight, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { STATE_BADGE, StateIcon } from "./floor-map";
import type { InboxRow } from "./floor-model";

// The Orders and Calls tabs (ADR-053): a grouped list, one row per table and
// request, the longest-waiting first. A row opens the table, as on the map.
export function InboxList({
  rows,
  empty,
  selected,
  onSelect,
}: {
  rows: readonly InboxRow[];
  empty: string;
  selected: string | null;
  onSelect: (tableId: string) => void;
}) {
  const t = useTranslations("waiter");
  if (rows.length === 0) {
    return (
      <p data-testid="inbox-empty" className="m-0 rounded-2xl bg-white px-4 py-6 text-center text-[1.0625rem] text-staff-label2">
        {empty}
      </p>
    );
  }
  return (
    <ul data-testid="inbox" className="m-0 list-none overflow-hidden rounded-2xl bg-white p-0">
      {rows.map((row) => {
        const label =
          row.kind === "bill" && row.table.bill?.payment
            ? t(row.table.bill.payment === "card" ? "state.billCard" : "state.billCash")
            : t(`state.${row.kind}`);
        return (
          <li key={`${row.table.id}-${row.kind}`} className="border-b border-staff-sep last:border-b-0">
            <button
              type="button"
              data-testid="inbox-row"
              data-table={row.table.label}
              data-kind={row.kind}
              aria-current={selected === row.table.id ? "true" : undefined}
              onClick={() => onSelect(row.table.id)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left aria-[current=true]:bg-staff-fill"
            >
              <span aria-hidden="true" className={clsx("grid size-10 shrink-0 place-items-center rounded-full", STATE_BADGE[row.kind])}>
                <StateIcon state={row.kind} payment={row.table.bill?.payment} className="size-5" />
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="text-[1.0625rem] leading-snug font-semibold [overflow-wrap:anywhere]">
                  {t("panel.table", { label: row.table.label })}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 text-[0.9375rem] leading-snug text-staff-label2">
                  <span>{label}</span>
                  <span className="num inline-flex items-center gap-1">
                    <Clock aria-hidden="true" className="size-3.5 shrink-0" />
                    {row.minutes > 0 ? t("inbox.ago", { minutes: row.minutes }) : t("inbox.now")}
                  </span>
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-staff-label2" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
