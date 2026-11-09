"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { createTelegramLink, type LinkState } from "./actions";
import { telegramLink } from "./events";

const initial: LinkState = { code: null, expiresAt: null, error: null };
// Typed to the bot when there is no t.me link to press (a bot command, not UI text).
const startCommand = (code: string) => "/start " + code;

// «Միացնել Telegram»: a one-time code for t.me/<bot>?start=<code> (screens.md 14).
export function TelegramConnect({
  botReady,
  botUsername,
}: {
  botReady: boolean;
  botUsername: string | null;
}) {
  const t = useTranslations("telegram");
  const [state, action, pending] = useActionState(createTelegramLink, initial);
  return (
    <form action={action} className="rounded-sheet border-line flex flex-col gap-3 border bg-white p-4">
      <h2 className="text-lg font-semibold">{t("connectTitle")}</h2>
      <p className="text-muted">{t("connectHint")}</p>
      <button
        type="submit"
        disabled={pending || !botReady}
        className="rounded-input bg-tarragon h-12 px-4 font-semibold text-white disabled:opacity-60"
      >
        {t("connect")}
      </button>
      {state.code && (
        <div className="flex flex-col gap-2" aria-live="polite" data-testid="telegram-link">
          {botUsername ? (
            <>
              <a
                href={telegramLink(botUsername, state.code)}
                target="_blank"
                rel="noreferrer"
                className="rounded-input border-tarragon text-tarragon flex h-12 items-center justify-center border px-4 font-semibold"
              >
                {t("openChat")}
              </a>
              <a
                href={telegramLink(botUsername, state.code, true)}
                target="_blank"
                rel="noreferrer"
                className="rounded-input border-line-strong flex h-12 items-center justify-center border px-4 font-semibold"
              >
                {t("openGroup")}
              </a>
              <p className="text-muted">{t("linkHint")}</p>
            </>
          ) : (
            <>
              <code className="num rounded-input bg-mist p-3 text-lg break-all">
                {startCommand(state.code)}
              </code>
              <p className="text-muted">{t("commandHint")}</p>
            </>
          )}
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-pomegranate">
          {state.error === "rate_limited" ? t("rateLimited") : t("error")}
        </p>
      )}
    </form>
  );
}
