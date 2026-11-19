"use client";

import { CircleCheck, CloudUpload, RefreshCw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { formatTime } from "@/lib/format/date";
import { formatAmd } from "@/lib/format/money";
import type { OutboxEntry } from "@/lib/offline/outbox";
import type { WaiterAction } from "./floor-model";
import { button, Sheet } from "./ui";

export type SentTap = { id: string; action: WaiterAction; label: string | null; at: number };

// The outbox made visible (scout finding «visible offline queue»): staff who
// can't see a queued order re-enter it, and the kitchen gets it twice. Each
// waiting tap with its table and the time it was saved; a manual «send now»;
// a way to take one back; and the last few that did go out.
export function QueueSheet({
  entries,
  sent,
  labelOf,
  timeZone,
  onRetry,
  onDiscard,
  onClose,
}: {
  entries: readonly OutboxEntry<WaiterAction>[];
  sent: readonly SentTap[];
  labelOf: (action: WaiterAction) => string | null;
  timeZone: string;
  onRetry: () => void;
  onDiscard: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations("waiter");
  const locale = useLocale() as Locale;
  const id = useId();
  const [confirming, setConfirming] = useState<string | null>(null);

  const what = (action: WaiterAction) =>
    action.kind === "place"
      ? t("queue.kind.place", { total: formatAmd(action.preview.total, locale) })
      : t(`queue.kind.${action.kind}`);
  const table = (action: WaiterAction) => {
    const label = labelOf(action);
    return label === null ? null : t("panel.table", { label });
  };

  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <div className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="grid gap-1 px-5 pt-5 pb-3 sm:px-6">
          <h2 id={id} className="m-0 text-[1.375rem] leading-tight font-bold">
            {t("queue.title")}
          </h2>
          <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("queue.hint")}</p>
        </div>
        <div className="grid content-start gap-4 overflow-y-auto px-5 pb-4 sm:px-6">
          {entries.length === 0 ? (
            <p className="m-0 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-[1.0625rem] font-semibold">
              <CircleCheck aria-hidden="true" className="text-tarragon size-5 shrink-0" />
              {t("queue.empty")}
            </p>
          ) : (
            <ul data-testid="queue-list" className="m-0 list-none overflow-hidden rounded-2xl bg-white p-0">
              {entries.map((e) => (
                <li
                  key={e.id}
                  data-testid="queue-entry"
                  className="border-staff-sep grid gap-2 border-b px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-start gap-3">
                    <CloudUpload aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
                    <div className="grid min-w-0 flex-1">
                      <span className="text-[1.0625rem] leading-snug font-semibold [overflow-wrap:anywhere]">
                        {[table(e.action), what(e.action)].filter(Boolean).join(" · ")}
                      </span>
                      <span className="num text-staff-label2 text-[0.9375rem] leading-snug">
                        {t("queue.savedAt", { time: formatTime(new Date(e.createdAt), timeZone) })}
                        {e.attempts > 0 && ` · ${t("queue.tries", { count: e.attempts })}`}
                      </span>
                    </div>
                    {confirming !== e.id && (
                      <button
                        type="button"
                        className={button("secondary", "shrink-0 px-4 text-[0.9375rem]")}
                        onClick={() => setConfirming(e.id)}
                      >
                        <Trash2 aria-hidden="true" />
                        {t("queue.remove")}
                      </button>
                    )}
                  </div>
                  {confirming === e.id && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={button("secondary")}
                        onClick={() => setConfirming(null)}
                      >
                        {t("queue.keep")}
                      </button>
                      <button
                        type="button"
                        className={button("destructive")}
                        onClick={() => void onDiscard(e.id).then(() => setConfirming(null))}
                      >
                        {t("queue.removeConfirm")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {sent.length > 0 && (
            <section aria-labelledby={`${id}-sent`} className="grid gap-2">
              <h3 id={`${id}-sent`} className="text-staff-label2 m-0 px-1 text-[0.8125rem] font-semibold">
                {t("queue.sentTitle")}
              </h3>
              <ul className="m-0 list-none overflow-hidden rounded-2xl bg-white p-0">
                {sent.map((s) => (
                  <li
                    key={s.id}
                    className="border-staff-sep flex items-start gap-3 border-b px-4 py-2.5 last:border-b-0"
                  >
                    <CircleCheck aria-hidden="true" className="text-tarragon mt-0.5 size-5 shrink-0" />
                    <span className="grid min-w-0">
                      <span className="text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">
                        {[s.label === null ? null : t("panel.table", { label: s.label }), what(s.action)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="num text-staff-label2 text-[0.8125rem] leading-snug">
                        {t("queue.sentAt", { time: formatTime(new Date(s.at), timeZone) })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="border-staff-sep grid grid-cols-2 gap-2 border-t bg-white px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6">
          <button type="button" className={button("secondary")} onClick={onClose}>
            {t("queue.close")}
          </button>
          <button
            type="button"
            className={button("primary")}
            disabled={entries.length === 0}
            onClick={onRetry}
          >
            <RefreshCw aria-hidden="true" />
            {t("queue.sendNow")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
