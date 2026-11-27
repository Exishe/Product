"use client";

import { clsx } from "clsx";
import { ChefHat, ChevronRight, CircleAlert, CircleCheck, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { STATE_BADGE, StateIcon } from "./floor-map";
import { quickAction, type InboxRow, type WaiterAction } from "./floor-model";
import { button } from "./ui";

// Short verbs, so every button reads as an action in the same column (the
// row's badge already shows what kind of thing it is). «Նշել մատուցված» is the
// table panel's own words for the same step, so one action has one name and
// the pill never reads like the «Մատուցված է» state.
const QUICK_LABEL = {
  accept: "inbox.quick.accept",
  serve: "inbox.quick.serve",
  going: "inbox.quick.going",
  settle: "inbox.quick.settle",
} as const;

// Minutes after which a row's wait turns red with an alert sign: a call or a
// ready plate after 3, a new order or a bill after 5.
const OVERDUE_FAST = 3;
const OVERDUE_SLOW = 5;

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
        className="text-staff-label2 m-0 flex items-center gap-3 py-4 text-[1.0625rem]"
      >
        <CircleCheck aria-hidden="true" className="size-6 shrink-0" />
        {empty}
      </p>
    );
  }
  // Rows on the page itself, split by hairlines; the action is a fixed
  // column, so every button lines up and reads at a glance.
  return (
    <ul data-testid="inbox" className="border-staff-sep m-0 list-none border-t p-0">
      {rows.map((row) => {
        const label =
          row.kind === "bill" && row.table.bill?.payment
            ? t(row.table.bill.payment === "card" ? "state.billCard" : "state.billCash")
            : t(`state.${row.kind}`);
        const quick = quickAction(row);
        // A guest waving or a plate going cold can't wait like a bill can. An
        // order still in the kitchen is the kitchen's wait, not the waiter's.
        const cooking = row.kind === "cooking";
        const overdue =
          !cooking &&
          row.minutes >= (row.kind === "call" || row.kind === "ready" ? OVERDUE_FAST : OVERDUE_SLOW);
        const TimeIcon = overdue ? CircleAlert : Clock;
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
            className="border-staff-sep aria-[current=true]:bg-staff-fill grid min-h-[4.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b"
            aria-current={selected === row.table.id ? "true" : undefined}
          >
            <button
              type="button"
              data-testid="inbox-open"
              onClick={() => onSelect(row.table.id)}
              className="flex min-h-[4.5rem] min-w-0 items-center gap-3 py-2 text-left"
            >
              <span
                aria-hidden="true"
                className={clsx(
                  "grid size-10 shrink-0 place-items-center rounded-full",
                  cooking ? STATE_BADGE.busy : STATE_BADGE[row.kind as Exclude<InboxRow["kind"], "cooking">],
                )}
              >
                {cooking ? (
                  <ChefHat aria-hidden="true" className="size-5" />
                ) : (
                  <StateIcon
                    state={row.kind as Exclude<InboxRow["kind"], "cooking">}
                    payment={row.table.bill?.payment}
                    className="size-5"
                  />
                )}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="text-[1.0625rem] leading-snug font-semibold [overflow-wrap:anywhere]">
                  {t("panel.table", { label: row.table.label })}
                </span>
                <span className="text-staff-label2 flex flex-wrap items-center gap-x-3 text-[0.9375rem] leading-snug">
                  <span>{label}</span>
                  <span
                    data-overdue={overdue || undefined}
                    className={clsx(
                      "num inline-flex items-center gap-1",
                      overdue && "text-pomegranate font-bold",
                    )}
                  >
                    <TimeIcon aria-hidden="true" className="size-3.5 shrink-0" />
                    {row.minutes > 0 ? t("inbox.ago", { minutes: row.minutes }) : t("inbox.now")}
                  </span>
                </span>
              </span>
              {!quick && <ChevronRight aria-hidden="true" className="text-staff-label2 size-5 shrink-0" />}
            </button>
            {quick && (
              <button
                type="button"
                data-testid="inbox-quick"
                data-quick={quick.kind}
                aria-label={t("inbox.action", { action: quickText, label: row.table.label })}
                onClick={run}
                // Ink like every row action: red belongs to the state circle
                // and the overdue time, never to a button.
                className={button(
                  "primary",
                  "max-w-44 min-w-32 shrink-0 px-3! text-center text-[0.9375rem] leading-tight",
                )}
              >
                {/* «Փակել հաշիվը» widens the pill a little, or takes two lines; never cut. */}
                <span className="min-w-0 [text-wrap:balance]">{quickText}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
