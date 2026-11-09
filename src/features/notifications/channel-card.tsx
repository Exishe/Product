"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { updateChannel, type ChannelState } from "./actions";
import { ALERT_EVENTS, eventKey } from "./events";

const initial: ChannelState = { saved: false, tested: false, error: null };
const LOCALES = ["hy", "ru", "en"] as const;

export type ChannelView = {
  id: string;
  kind: "telegram" | "web_push";
  title: string | null;
  locale: (typeof LOCALES)[number];
  events: string[];
};

// One connected chat or one person's phone notifications: which alerts, in
// which language, a test message, and switching it off.
export function ChannelCard({ channel }: { channel: ChannelView }) {
  const t = useTranslations("telegram");
  const [state, action, pending] = useActionState(updateChannel, initial);
  const name = channel.kind === "web_push" ? t("pushChannel") : (channel.title ?? t("kindTelegram"));
  return (
    <li className="rounded-sheet border-line border bg-white p-4" data-testid="channel-card">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="channelId" value={channel.id} />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="min-w-0 text-lg font-semibold break-words">{name}</h3>
          <span className="text-muted text-sm">
            {channel.kind === "web_push" ? t("kindPush") : t("kindTelegram")}
          </span>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-muted mb-1 text-sm font-semibold">{t("eventsLegend")}</legend>
          {ALERT_EVENTS.map((e) => (
            <label key={e} className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                name="events"
                value={e}
                defaultChecked={channel.events.includes(e)}
                className="accent-tarragon size-6"
              />
              <span>{t(`events.${eventKey(e)}`)}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-sm font-semibold">{t("language")}</span>
          <select
            name="locale"
            defaultValue={channel.locale}
            className="rounded-input border-line-strong h-12 border bg-white px-3"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l} lang={l}>
                {t(`languages.${l}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={pending}
            className="rounded-input bg-tarragon h-12 px-4 font-semibold text-white disabled:opacity-60"
          >
            {t("save")}
          </button>
          <button
            type="submit"
            name="intent"
            value="test"
            disabled={pending}
            className="rounded-input border-tarragon text-tarragon h-12 border px-4 font-semibold disabled:opacity-60"
          >
            {t("sendTest")}
          </button>
          <button
            type="submit"
            name="intent"
            value="disconnect"
            disabled={pending}
            className="rounded-input border-pomegranate text-pomegranate h-12 border px-4 font-semibold disabled:opacity-60"
          >
            {t("disconnect")}
          </button>
        </div>
        <p aria-live="polite" className="min-h-6 text-sm">
          {state.saved && <span className="text-tarragon">{t("saved")}</span>}
          {state.tested && <span className="text-tarragon">{t("testQueued")}</span>}
          {state.error && (
            <span role="alert" className="text-pomegranate">
              {state.error === "rate_limited" ? t("rateLimited") : t("error")}
            </span>
          )}
        </p>
      </form>
    </li>
  );
}
