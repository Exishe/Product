"use client";

import { BellRing, Receipt, Volume2, VolumeX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { bannerRows, type AlertRequest, type AlertState } from "./call-alerts";

// «Sound on» in the header: the one tap a browser needs before it lets the page
// make a sound. Tapping it again plays the sound, to check the volume.
export function SoundButton({ on, onTap }: { on: boolean; onTap: () => void }) {
  const t = useTranslations("waiter.alerts");
  return (
    <button
      type="button"
      data-testid="sound-toggle"
      data-state={on ? "on" : "off"}
      aria-label={on ? t("soundOnTest") : undefined}
      onClick={onTap}
      className={
        on
          ? "bg-tarragon-tint text-tarragon inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-[0.8125rem] font-semibold"
          : "bg-amber text-ink inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-[0.8125rem] font-semibold"
      }
    >
      {on ? <Volume2 aria-hidden="true" className="size-5" /> : <VolumeX aria-hidden="true" className="size-5" />}
      {on ? t("soundOn") : t("soundOff")}
    </button>
  );
}

// Large banners above the floor: who is calling, with the usual answer. At
// most three; the rest are counted. Until sound is on, they say so.
export function CallBanners({
  requests,
  state,
  soundOn,
  played,
  onEnableSound,
  onGoing,
  onOpenTable,
  onClose,
}: {
  requests: readonly AlertRequest[];
  state: AlertState;
  soundOn: boolean;
  played: number;
  onEnableSound: () => void;
  onGoing: (request: AlertRequest) => void;
  onOpenTable: (request: AlertRequest) => void;
  onClose: (id: string) => void;
}) {
  const t = useTranslations("waiter");
  const { shown, more } = bannerRows(requests, state);
  if (shown.length === 0) return null;
  return (
    <section
      aria-label={t("alerts.region")}
      aria-live="assertive"
      data-testid="call-alerts"
      data-alerts-played={played}
      className="grid gap-2"
    >
      {shown.map((r) => (
        <div
          key={r.id}
          data-testid="call-banner"
          data-kind={r.kind}
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3 admin-rise ${
            r.kind === "call" ? "bg-pomegranate text-white" : "bg-amber text-ink"
          }`}
        >
          {r.kind === "call" ? (
            <BellRing aria-hidden="true" className="size-7 shrink-0" />
          ) : (
            <Receipt aria-hidden="true" className="size-7 shrink-0" />
          )}
          <p className="m-0 min-w-0 flex-1 basis-48 text-[1.25rem] leading-tight font-bold [overflow-wrap:anywhere]">
            {t(r.kind === "call" ? "alerts.call" : "alerts.bill", { label: r.label })}
          </p>
          <button
            type="button"
            data-testid="call-banner-action"
            onClick={() => (r.kind === "call" ? onGoing(r) : onOpenTable(r))}
            className={`min-h-12 shrink-0 rounded-full px-5 text-[1.0625rem] font-semibold ${
              r.kind === "call" ? "text-ink bg-white" : "bg-ink text-white"
            }`}
          >
            {r.kind === "call" ? t("panel.going") : t("alerts.open")}
          </button>
          <button
            type="button"
            aria-label={t("alerts.close")}
            onClick={() => onClose(r.id)}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-black/15"
          >
            <X aria-hidden="true" className="size-6" />
          </button>
        </div>
      ))}
      {more > 0 && (
        <p className="m-0 px-1 text-[1.0625rem] font-semibold" data-testid="call-more">
          {t("alerts.more", { count: more })}
        </p>
      )}
      {!soundOn && (
        <button
          type="button"
          onClick={onEnableSound}
          className="bg-staff-fill text-ink flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-[1.0625rem] font-semibold"
        >
          <VolumeX aria-hidden="true" className="size-5" />
          {t("alerts.soundHint")}
        </button>
      )}
    </section>
  );
}
