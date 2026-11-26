"use client";

import { clsx } from "clsx";
import { BellRing, Check, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { entryLabel, summarizeAlert, type NewOrderAlert } from "./new-order-alert";

// A cook across the room must see that an order arrived, without losing the
// board under it: one row on the board's own white, at most 96 px (18% of the
// screen), in the board's grid and never over the tickets. The bell, how many,
// the tables (an allergy first, red with its shield), and «Տեսա» on the right.
// Only that button dismisses it, so a sleeve brushing the row does not. The
// apricot frame breathes once per 1.6 s, only if motion is allowed.
export function NewOrderBanner({ alert, onAck }: { alert: NewOrderAlert; onAck: () => void }) {
  const t = useTranslations("kitchen");
  // Allergy orders first, so the red chip is always one of those shown.
  const sorted = { ...alert, entries: [...alert.entries].sort((a, b) => Number(b.allergy) - Number(a.allergy)) };
  const { count, shown, more, allergy } = summarizeAlert(sorted);
  const tableLabel = (table: string) => t("ticket.tableLabel", { table });
  const title = count > 1 ? t("newOrder.titleMany", { count }) : t("newOrder.title");
  // Read out by the live region: "New order. Table 4 · #12".
  const spoken = [
    title,
    shown.map((x) => entryLabel(x, tableLabel)).join(", "),
    allergy ? t("newOrder.allergy") : "",
  ]
    .filter(Boolean)
    .join(". ");
  // One chip on a portrait tablet, two from 1024 px, three from 1536 px; the
  // rest are counted, so a chip is never cut in half.
  const VISIBLE = ["", "max-lg:hidden", "max-2xl:hidden"];
  const hiddenAt = (visible: number) => more + Math.max(0, shown.length - visible);
  const counts = [
    { n: hiddenAt(1), className: "lg:hidden" },
    { n: hiddenAt(2), className: "max-lg:hidden 2xl:hidden" },
    { n: hiddenAt(3), className: "max-2xl:hidden" },
  ];
  const allergyChip = shown.findIndex((x) => x.allergy);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="new-order-alert"
      className="px-4 pt-3 lg:px-6"
    >
      <div
        className={clsx(
          "text-slip flex max-h-[18dvh] min-h-0 items-center gap-x-4 overflow-hidden rounded-2xl border-4 border-(--color-apricot) bg-white py-2 pr-2 pl-4",
          "motion-safe:animate-[new-order-pulse_1.6s_ease-in-out_infinite]",
        )}
      >
        <BellRing aria-hidden="true" className="text-apricot-deep size-10 shrink-0 max-sm:hidden" />
        {/* The button's name says it all once; the row is drawn for the eyes. */}
        <span
          aria-hidden="true"
          className="shrink-0 text-[clamp(1.75rem,3.4vw,3rem)] leading-none font-extrabold tracking-tight whitespace-nowrap"
        >
          {title}
        </span>
        <span aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {shown.map((x, i) => (
            <span
              key={x.id}
              data-allergy={x.allergy || undefined}
              className={clsx(
                "num inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-1 text-[clamp(1.25rem,2.1vw,1.75rem)] leading-tight font-extrabold whitespace-nowrap",
                x.allergy ? "bg-late-on-dark text-white" : "bg-basalt-4 text-slip",
                VISIBLE[i],
              )}
            >
              {i === allergyChip && (
                <span data-testid="new-order-allergy" className="inline-flex">
                  <ShieldAlert aria-hidden="true" className="size-[1em] shrink-0" />
                  <span className="sr-only">{t("newOrder.allergy")}</span>
                </span>
              )}
              {x.allergy && i !== allergyChip && <ShieldAlert aria-hidden="true" className="size-[1em] shrink-0" />}
              {entryLabel(x, tableLabel)}
            </span>
          ))}
          {counts.map(
            (c, i) =>
              c.n > 0 && (
                <span
                  key={i}
                  className={clsx(
                    "num text-slip-dim shrink-0 px-1 text-[clamp(1.25rem,2.1vw,1.75rem)] leading-tight font-extrabold",
                    c.className,
                  )}
                >
                  {t("newOrder.more", { count: c.n })}
                </span>
              ),
          )}
        </span>
        <button
          type="button"
          onClick={onAck}
          data-testid="new-order-ack"
          aria-label={`${spoken}. ${t("newOrder.ack")}`}
          className="bg-slip focus-visible:outline-apricot-deep ml-auto inline-flex min-h-16 shrink-0 cursor-pointer items-center gap-2 rounded-full px-7 text-[1.75rem] leading-none font-bold text-white outline-offset-4 focus-visible:outline-4"
        >
          <Check aria-hidden="true" className="size-8 shrink-0" />
          {t("newOrder.ack")}
        </button>
      </div>
    </div>
  );
}
