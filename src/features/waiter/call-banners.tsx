"use client";

import { clsx } from "clsx";
import { BellRing, ChevronRight, Receipt, Volume2, VolumeX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { bannerRows, type AlertRequest, type AlertState } from "./call-alerts";
import { HEADER_ICON } from "./ui";

// «Sound» in the header: the one tap a browser needs before it lets the page
// make a sound. Tapping it again plays the sound, to check the volume. The same
// white round tool as its neighbour; while it is off and a guest is waiting it
// gets a red dot (red is a state colour, a setting never gets a fill).
export function SoundButton({ on, onTap, warn }: { on: boolean; onTap: () => void; warn?: boolean }) {
  const t = useTranslations("waiter.alerts");
  return (
    <button
      type="button"
      data-testid="sound-toggle"
      data-state={on ? "on" : "off"}
      aria-label={on ? t("soundOnTest") : t("soundOff")}
      onClick={onTap}
      className={clsx(HEADER_ICON, "relative")}
    >
      {on ? (
        <Volume2 aria-hidden="true" className="size-5 shrink-0" />
      ) : (
        <VolumeX aria-hidden="true" className="size-5 shrink-0" />
      )}
      {!on && warn && (
        <span
          aria-hidden="true"
          className="bg-pomegranate absolute top-0.5 right-0.5 size-3 rounded-full ring-2 ring-white"
        />
      )}
    </button>
  );
}

// Calls and bill requests under the header: one 56 px red bar at every width
// (the one alert channel, as the benchmark asks). One request is the bar
// itself with its answer and its close; two or more are «Կանչում են՝ N սեղան»,
// which opens the Calls list. Calls and bills are both red: a guest waits.
export function CallBanners({
  requests,
  state,
  played,
  onGoing,
  onOpenTable,
  onClose,
  onOpenCalls,
  className,
}: {
  requests: readonly AlertRequest[];
  state: AlertState;
  played: number;
  onGoing: (request: AlertRequest) => void;
  onOpenTable: (request: AlertRequest) => void;
  onClose: (id: string) => void;
  onOpenCalls: () => void;
  className?: string;
}) {
  const t = useTranslations("waiter");
  const { shown: rows, more } = bannerRows(requests, state);
  if (rows.length === 0) return null;
  const many = rows.length > 1;
  return (
    <section
      aria-label={t("alerts.region")}
      aria-live="assertive"
      data-testid="call-alerts"
      data-alerts-played={played}
      className={clsx("grid", className)}
    >
      {many ? (
        <button
          type="button"
          data-testid="call-summary"
          onClick={onOpenCalls}
          className="admin-rise bg-pomegranate flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left text-white"
        >
          <BellRing aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">
            {t("alerts.summary", { count: rows.length + more })}
          </span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
        </button>
      ) : (
        rows.map((r) => (
          <div
            key={r.id}
            data-testid="call-banner"
            data-kind={r.kind}
            className="admin-rise bg-pomegranate flex min-h-14 min-w-0 items-center gap-2 rounded-2xl py-1.5 pr-1.5 pl-4 text-white"
          >
            {r.kind === "call" ? (
              <BellRing aria-hidden="true" className="size-5 shrink-0" />
            ) : (
              <Receipt aria-hidden="true" className="size-5 shrink-0" />
            )}
            {/* Two lines before it would cut: nothing of the request is lost. */}
            <p className="m-0 line-clamp-2 min-w-0 flex-1 text-[1rem] leading-tight font-semibold">
              {t(r.kind === "call" ? "alerts.call" : "alerts.bill", { label: r.label })}
            </p>
            <button
              type="button"
              data-testid="call-banner-action"
              onClick={() => (r.kind === "call" ? onGoing(r) : onOpenTable(r))}
              className="text-ink min-h-11 shrink-0 rounded-full bg-white px-4 text-[0.9375rem] font-semibold whitespace-nowrap"
            >
              {r.kind === "call" ? t("panel.going") : t("alerts.openShort")}
            </button>
            <button
              type="button"
              aria-label={t("alerts.close")}
              onClick={() => onClose(r.id)}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        ))
      )}
    </section>
  );
}
