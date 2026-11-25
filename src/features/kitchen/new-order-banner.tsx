"use client";

import { clsx } from "clsx";
import { BellRing, Check, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { entryLabel, summarizeAlert, type NewOrderAlert } from "./new-order-alert";

// A cook across the room must see that an order arrived: huge type, high
// contrast, and it stays until someone taps it. It sits in the board's own grid
// (never over the tickets) and is capped at 40% of the screen height.
// The border pulses slowly (one beat per 1.6 s) and only if motion is allowed.
export function NewOrderBanner({ alert, onAck }: { alert: NewOrderAlert; onAck: () => void }) {
  const t = useTranslations("kitchen");
  const { count, shown, more, allergy } = summarizeAlert(alert);
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

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="new-order-alert"
      className="max-h-[40dvh] min-h-0 px-4 pt-3"
    >
      <button
        type="button"
        onClick={onAck}
        data-testid="new-order-ack"
        aria-label={`${spoken}. ${t("newOrder.ack")}`}
        className={clsx(
          "bg-slip focus-visible:outline-apricot-deep grid max-h-[calc(40dvh-0.75rem)] w-full cursor-pointer gap-2 overflow-hidden rounded-2xl border-[6px] border-(--color-apricot) p-4 text-left text-white outline-offset-4 focus-visible:outline-[6px] sm:p-5",
          "motion-safe:animate-[new-order-pulse_1.6s_ease-in-out_infinite]",
        )}
      >
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <BellRing
            aria-hidden="true"
            className="size-[clamp(2.5rem,7vw,4.5rem)] shrink-0 text-(--color-apricot) max-sm:hidden"
          />
          <span className="text-[clamp(2.5rem,min(8vw,9dvh),5rem)] leading-none font-black tracking-tight">
            {title}
          </span>
          <span className="ml-auto inline-flex min-h-14 items-center gap-2 rounded-full bg-white px-6 text-2xl font-bold text-(--color-ink) sm:min-h-16 sm:px-8 sm:text-3xl">
            <Check aria-hidden="true" className="size-8" />
            {t("newOrder.ack")}
          </span>
        </span>
        {allergy && (
          <span
            data-testid="new-order-allergy"
            className="bg-late-on-dark flex items-center gap-3 rounded-xl px-4 py-2 text-[clamp(1.5rem,min(5vw,5dvh),3rem)] leading-tight font-black text-white"
          >
            <ShieldAlert aria-hidden="true" className="size-[1.1em] shrink-0" />
            {t("newOrder.allergy")}
          </span>
        )}
        <span className="flex flex-wrap gap-x-3 gap-y-1.5">
          {shown.map((x) => (
            <span
              key={x.id}
              data-allergy={x.allergy || undefined}
              className={clsx(
                "num inline-flex items-center gap-2 rounded-xl px-4 py-0.5 text-[clamp(1.25rem,min(4.2vw,4.5dvh),2.75rem)] leading-tight font-extrabold",
                x.allergy ? "bg-late-on-dark text-white" : "bg-white/15 text-white",
              )}
            >
              {x.allergy && <ShieldAlert aria-hidden="true" className="size-[1em] shrink-0" />}
              {entryLabel(x, tableLabel)}
            </span>
          ))}
          {more > 0 && (
            <span className="num inline-flex items-center rounded-xl bg-white px-4 py-1 text-[clamp(1.25rem,min(4.2vw,4.5dvh),2.75rem)] leading-tight font-extrabold text-(--color-ink)">
              {t("newOrder.more", { count: more })}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
