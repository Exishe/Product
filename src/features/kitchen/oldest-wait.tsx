"use client";

import { clsx } from "clsx";
import { CircleAlert, Clock, Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ShownTicket } from "./board-model";
import { classifyLateness, elapsedMinutes } from "./lateness";

// The top bar's «longest wait»: the open order (New or Cooking) that has
// waited longest, with its table and minutes, in the ticket's own colours
// (grey, amber from 8 minutes, red from 12). The head cook sees the pressure on
// the line without scanning every column; a tap scrolls to that ticket.
export function OldestWait({ tickets, now }: { tickets: readonly ShownTicket[]; now: number }) {
  const t = useTranslations("kitchen");
  const open = tickets.filter((x) => x.kind === "order");
  if (open.length === 0) return null;
  const oldest = open.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
  const age = now - oldest.createdAt;
  const lateness = classifyLateness(age, oldest.status === "cooking" ? "cooking" : "new");
  const Icon = lateness === "late" ? CircleAlert : lateness === "hurry" ? Hourglass : Clock;
  const where = oldest.table
    ? t("ticket.tableLabel", { table: oldest.table })
    : t("ticket.voidOrder", { number: oldest.number });
  return (
    <button
      type="button"
      data-testid="oldest-wait"
      data-lateness={lateness}
      onClick={() =>
        document
          .querySelector(`[data-ticket-id="${oldest.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
      }
      // One line the line cook reads from two metres: the icon, the table and
      // the minutes at 20 px. What it is («Ամենաերկար սպասողը») is the name
      // and the tooltip, not a second, small line.
      title={t("oldest")}
      aria-label={`${t("oldest")}: ${where} · ${t("ticket.minutes", { minutes: elapsedMinutes(age) })}`}
      className={clsx(
        "inline-flex min-h-12 items-center gap-2 self-center rounded-xl px-3 py-1 text-left text-xl leading-tight font-semibold",
        lateness === "late"
          ? "bg-late-on-dark text-white"
          : lateness === "hurry"
            ? "bg-apricot text-ink"
            : "text-slip",
      )}
    >
      <Icon aria-hidden="true" className="size-6 shrink-0" />
      <span className="num whitespace-nowrap">
        {where} · {t("ticket.minutes", { minutes: elapsedMinutes(age) })}
      </span>
    </button>
  );
}
