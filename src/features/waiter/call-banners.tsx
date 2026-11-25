"use client";

import { clsx } from "clsx";
import { BellRing, ChevronRight, Receipt, Volume2, VolumeX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { bannerRows, type AlertRequest, type AlertState } from "./call-alerts";

// «Sound» in the header: the one tap a browser needs before it lets the page
// make a sound. Tapping it again plays the sound, to check the volume. A calm
// white button like its neighbours; amber only while a call rings unheard.
export function SoundButton({ on, onTap, warn }: { on: boolean; onTap: () => void; warn?: boolean }) {
  const t = useTranslations("waiter.alerts");
  return (
    <button
      type="button"
      data-testid="sound-toggle"
      data-state={on ? "on" : "off"}
      aria-label={on ? t("soundOnTest") : t("soundOff")}
      onClick={onTap}
      className={clsx(
        "inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-[0.875rem] font-semibold sm:w-auto sm:px-3.5",
        !on && warn ? "bg-amber text-ink" : "text-ink border-staff-sep border bg-white",
      )}
    >
      {on ? (
        <Volume2 aria-hidden="true" className="text-tarragon size-5 shrink-0" />
      ) : (
        <VolumeX aria-hidden="true" className={clsx("size-5 shrink-0", !warn && "text-staff-label2")} />
      )}
      <span aria-hidden="true" className="max-sm:hidden">
        {t("sound")}
      </span>
    </button>
  );
}

// Calls and bill requests under the header: one 56 px row each, the answer and
// the close on the same line. A phone shows one row: the call itself, or
// «N սեղան սպասում է» that opens the Calls list. A tablet shows two side by
// side; the rest are counted. Calls are red, bills ink, as on the tiles.
export function CallBanners({
  requests,
  state,
  played,
  onGoing,
  onOpenTable,
  onClose,
  onOpenCalls,
}: {
  requests: readonly AlertRequest[];
  state: AlertState;
  played: number;
  onGoing: (request: AlertRequest) => void;
  onOpenTable: (request: AlertRequest) => void;
  onClose: (id: string) => void;
  onOpenCalls: () => void;
}) {
  const t = useTranslations("waiter");
  const { shown: rows, more: beyond } = bannerRows(requests, state);
  if (rows.length === 0) return null;
  // One row of two on a tablet keeps the header to 56 px; the rest are counted.
  const shown = rows.slice(0, 2);
  const more = beyond + rows.length - shown.length;
  const many = rows.length > 1;
  const anyCall = rows.some((r) => r.kind === "call");
  return (
    <section
      aria-label={t("alerts.region")}
      aria-live="assertive"
      data-testid="call-alerts"
      data-alerts-played={played}
      className="grid gap-2 sm:grid-cols-2"
    >
      {many && (
        <button
          type="button"
          data-testid="call-summary"
          onClick={onOpenCalls}
          className={clsx(
            "admin-rise flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left sm:hidden",
            anyCall ? "bg-pomegranate text-white" : "bg-ink text-white",
          )}
        >
          <BellRing aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[1rem] font-semibold">
            {t("alerts.summary", { count: rows.length + beyond })}
          </span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
        </button>
      )}
      {shown.map((r) => (
        <div
          key={r.id}
          data-testid="call-banner"
          data-kind={r.kind}
          className={clsx(
            "admin-rise flex min-h-14 min-w-0 items-center gap-2 rounded-2xl py-1.5 pr-1.5 pl-4",
            r.kind === "call" ? "bg-pomegranate text-white" : "bg-ink text-white",
            many && "max-sm:hidden",
          )}
        >
          {r.kind === "call" ? (
            <BellRing aria-hidden="true" className="size-5 shrink-0" />
          ) : (
            <Receipt aria-hidden="true" className="size-5 shrink-0" />
          )}
          <p className="m-0 min-w-0 flex-1 truncate text-[1rem] leading-tight font-semibold">
            {t(r.kind === "call" ? "alerts.call" : "alerts.bill", { label: r.label })}
          </p>
          <button
            type="button"
            data-testid="call-banner-action"
            onClick={() => (r.kind === "call" ? onGoing(r) : onOpenTable(r))}
            className="text-ink min-h-11 shrink-0 rounded-full bg-white px-3.5 text-[0.9375rem] font-semibold whitespace-nowrap sm:px-4"
          >
            {r.kind === "call" ? t("panel.going") : t("alerts.open")}
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
      ))}
      {more > 0 && (
        <p
          className="text-staff-label2 m-0 px-1 text-[0.9375rem] font-semibold max-sm:hidden sm:col-span-2"
          data-testid="call-more"
        >
          {t("alerts.more", { count: more })}
        </p>
      )}
    </section>
  );
}
