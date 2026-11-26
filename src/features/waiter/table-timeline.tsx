"use client";

import { clsx } from "clsx";
import {
  BellRing,
  Check,
  ClipboardList,
  HandPlatter,
  Receipt,
  SquarePen,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { formatTime } from "@/lib/format/date";
import { timeline, type FloorTable, type TimelineEvent } from "./floor-model";

const ICON: Record<TimelineEvent["kind"], LucideIcon> = {
  seated: Users,
  placed: ClipboardList,
  accepted: Check,
  ready: HandPlatter,
  served: Check,
  call: BellRing,
  bill: Receipt,
};

// The table's evening, oldest first (scout finding «since last visit»): when
// the guests sat down, each round, when the food stood ready and went out,
// calls and the bill. A plain read of what the floor already holds.
export function TableTimeline({ table, timeZone }: { table: FloorTable; timeZone: string }) {
  const t = useTranslations("waiter.timeline");
  const events = timeline(table);
  if (events.length === 0) return null;

  const text = (e: TimelineEvent) => {
    switch (e.kind) {
      case "seated":
      case "call":
      case "bill":
        return t(e.kind);
      case "placed":
        return e.source === "waiter"
          ? t("placedByWaiter", { number: e.number })
          : t("placed", { number: e.number });
      case "accepted":
      case "served":
        return t(e.kind, { number: e.number });
      case "ready":
        return e.station
          ? t("readyAt", { number: e.number, station: e.station })
          : t("ready", { number: e.number });
    }
  };

  return (
    <section aria-labelledby="timeline-title" data-testid="timeline" className="grid gap-2">
      <h3 id="timeline-title" className="text-staff-label2 m-0 text-[0.9375rem] font-semibold">
        {t("title")}
      </h3>
      <ol className="m-0 grid list-none p-0">
        {events.map((e, i) => {
          const Icon = e.kind === "placed" && e.source === "waiter" ? SquarePen : ICON[e.kind];
          const last = i === events.length - 1;
          return (
            <li
              key={`${e.kind}-${e.at}-${i}`}
              data-testid="timeline-event"
              data-kind={e.kind}
              className="grid grid-cols-[3.25rem_1.5rem_minmax(0,1fr)] items-start gap-x-2 py-1.5"
            >
              <time
                dateTime={new Date(e.at).toISOString()}
                className="num text-staff-label2 pt-0.5 text-[0.9375rem] leading-snug"
              >
                {formatTime(new Date(e.at), timeZone)}
              </time>
              <span aria-hidden="true" className="relative grid h-full justify-items-center">
                <span
                  className={clsx(
                    "z-10 grid size-6 place-items-center rounded-full",
                    e.kind === "call" ? "bg-pom-tint text-pomegranate" : "bg-staff-fill text-ink",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                {!last && <span className="bg-staff-sep absolute top-6 -bottom-3 w-0.5" />}
              </span>
              <span className="text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{text(e)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
