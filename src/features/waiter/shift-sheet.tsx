"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { businessDate } from "@/features/dashboard/range";
import type { Locale } from "@/i18n/routing";
import { formatDate } from "@/lib/format/date";
import { formatAmd } from "@/lib/format/money";
import { getBrowserClient } from "@/lib/supabase/browser";
import { fetchShift, type ShiftSummary } from "./shift-model";
import { button, Sheet } from "./ui";

// «Իմ հերթափոխը»: the numbers to hand over at closing. Read once when opened;
// online only (it is a read, nothing is queued).
export function ShiftSheet({
  locationId,
  memberId,
  timeZone,
  dayStartsAt,
  onClose,
}: {
  locationId: string;
  memberId: string;
  timeZone: string;
  dayStartsAt: string;
  onClose: () => void;
}) {
  const t = useTranslations("waiter.shift");
  const tw = useTranslations("waiter");
  const locale = useLocale() as Locale;
  const id = useId();
  const [day] = useState(() => businessDate(new Date(), timeZone, dayStartsAt));
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ok"; data: ShiftSummary }
  >({
    kind: "loading",
  });

  useEffect(() => {
    let live = true;
    fetchShift(getBrowserClient(), locationId, memberId, day)
      .then((data) => live && setState(data ? { kind: "ok", data } : { kind: "error" }))
      .catch(() => live && setState({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [locationId, memberId, day]);

  const money = (n: number) => formatAmd(n, locale);
  const minutes = (m: number | null) =>
    m === null ? t("none") : m < 1 ? t("underMinute") : tw("minutesShort", { minutes: Math.round(m) });

  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <div className="grid gap-6 bg-white p-5 sm:p-6">
        <div className="grid gap-1">
          <h2 id={id} className="m-0 text-[1.375rem] leading-tight font-bold">
            {t("title")}
          </h2>
          <p className="text-staff-label2 m-0 text-[0.9375rem]">
            {t("subtitle", { date: formatDate(new Date(`${day}T12:00:00Z`), locale, "UTC") })}
          </p>
        </div>
        {state.kind === "loading" && (
          <p role="status" className="text-staff-label2 m-0 text-[1.0625rem]">
            {t("loading")}
          </p>
        )}
        {state.kind === "error" && (
          <p role="alert" className="text-pomegranate m-0 text-[1.0625rem] font-semibold">
            {t("error")}
          </p>
        )}
        {state.kind === "ok" && (
          // Two groups of hairline rows straight on the sheet, each under its
          // heading: no card frames, the sheet is the one surface.
          <>
            <section aria-labelledby={`${id}-money`} className="grid gap-1">
              <h3 id={`${id}-money`} className="m-0 text-[1.25rem] leading-tight font-bold">
                {t("money")}
              </h3>
              <dl data-testid="shift-money" className="border-staff-sep m-0 grid border-t">
                <Row label={t("cash")} value={money(state.data.cash)} strong />
                <Row testId="shift-card" label={t("card")} value={money(state.data.card)} />
                <Row label={t("total")} value={money(state.data.cash + state.data.card)} />
              </dl>
            </section>
            <section aria-labelledby={`${id}-work`} className="grid gap-1">
              <h3 id={`${id}-work`} className="m-0 text-[1.25rem] leading-tight font-bold">
                {t("work")}
              </h3>
              <dl data-testid="shift-work" className="border-staff-sep m-0 grid border-t">
                <Row label={t("tables")} value={String(state.data.tables)} />
                <Row label={t("entered")} value={String(state.data.entered)} />
                <Row label={t("accepted")} value={String(state.data.accepted)} />
                <Row label={t("acceptTime")} value={minutes(state.data.acceptMinutes)} />
              </dl>
            </section>
          </>
        )}
        <button type="button" className={button("secondary")} onClick={onClose}>
          {t("close")}
        </button>
      </div>
    </Sheet>
  );
}

function Row({
  label,
  value,
  strong,
  testId,
}: {
  label: string;
  value: string;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <div className="border-staff-sep flex min-h-14 items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className="text-[1.0625rem]">{label}</dt>
      <dd
        data-testid={testId}
        className={strong ? "num m-0 text-[1.25rem] font-bold" : "num m-0 text-[1.0625rem] font-semibold"}
      >
        {value}
      </dd>
    </div>
  );
}
