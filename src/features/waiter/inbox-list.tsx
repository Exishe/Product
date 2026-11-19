"use client";

import { clsx } from "clsx";
import { Check, ChevronRight, Clock, Footprints, HandPlatter, Receipt, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { STATE_BADGE, StateIcon } from "./floor-map";
import { quickAction, type InboxRow, type QuickAction, type WaiterAction } from "./floor-model";
import { button } from "./ui";

const QUICK_ICON: Record<QuickAction["kind"], LucideIcon> = {
  accept: Check,
  serve: HandPlatter,
  going: Footprints,
  settle: Receipt,
};
const QUICK_LABEL = {
  accept: "order.accept",
  serve: "order.serve",
  going: "panel.going",
  settle: "inbox.closeBill",
} as const;

// The Orders and Calls tabs (ADR-054): a grouped list, one row per table and
// request, the longest-waiting first. A row opens the table, as on the map;
// the button beside it does the one obvious thing without opening it
// (scout finding: «quick actions»), so a call or a plate is one tap.
export function InboxList({
  rows,
  empty,
  selected,
  onSelect,
  onAction,
  onSettle,
}: {
  rows: readonly InboxRow[];
  empty: string;
  selected: string | null;
  onSelect: (tableId: string) => void;
  onAction: (action: WaiterAction) => void;
  onSettle: (tableId: string, sessionId: string) => void;
}) {
  const t = useTranslations("waiter");
  if (rows.length === 0) {
    return (
      <p
        data-testid="inbox-empty"
        className="text-staff-label2 m-0 rounded-2xl bg-white px-4 py-6 text-center text-[1.0625rem]"
      >
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
        const quick = quickAction(row);
        const QuickIcon = quick ? QUICK_ICON[quick.kind] : null;
        const quickText = quick ? t(QUICK_LABEL[quick.kind]) : "";
        const run = () => {
          if (!quick) return;
          if (quick.kind === "settle") onSettle(row.table.id, quick.sessionId);
          else for (const action of quick.actions) onAction(action);
        };
        return (
          <li
            key={`${row.table.id}-${row.kind}`}
            data-testid="inbox-row"
            data-table={row.table.label}
            data-kind={row.kind}
            className="border-staff-sep aria-[current=true]:bg-staff-fill flex items-center gap-1 border-b pr-3 last:border-b-0"
            aria-current={selected === row.table.id ? "true" : undefined}
          >
            <button
              type="button"
              data-testid="inbox-open"
              onClick={() => onSelect(row.table.id)}
              className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left"
            >
              <span
                aria-hidden="true"
                className={clsx(
                  "grid size-10 shrink-0 place-items-center rounded-full",
                  STATE_BADGE[row.kind],
                )}
              >
                <StateIcon state={row.kind} payment={row.table.bill?.payment} className="size-5" />
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="text-[1.0625rem] leading-snug font-semibold [overflow-wrap:anywhere]">
                  {t("panel.table", { label: row.table.label })}
                </span>
                <span className="text-staff-label2 flex flex-wrap items-center gap-x-3 text-[0.9375rem] leading-snug">
                  <span>{label}</span>
                  <span className="num inline-flex items-center gap-1">
                    <Clock aria-hidden="true" className="size-3.5 shrink-0" />
                    {row.minutes > 0 ? t("inbox.ago", { minutes: row.minutes }) : t("inbox.now")}
                  </span>
                </span>
              </span>
              {!quick && <ChevronRight aria-hidden="true" className="text-staff-label2 size-5 shrink-0" />}
            </button>
            {quick && QuickIcon && (
              <button
                type="button"
                data-testid="inbox-quick"
                data-quick={quick.kind}
                aria-label={t("inbox.action", { action: quickText, label: row.table.label })}
                onClick={run}
                className={button(
                  row.kind === "call" ? "destructive" : "primary",
                  "max-w-[45%] shrink-0 px-4 text-[0.9375rem]",
                )}
              >
                <QuickIcon aria-hidden="true" />
                <span className="truncate">{quickText}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
