"use client";

import { ExternalLink, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { button } from "@/features/admin-ui/styles";
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
    <form action={action} className="flex flex-col gap-4 rounded-2xl bg-white p-4 sm:p-5">
      <h2 className="m-0 flex items-center gap-2 text-[1.25rem] font-bold">
        <Send aria-hidden="true" className="text-ink size-5 shrink-0" />
        {t("connectTitle")}
      </h2>
      <p className="text-staff-label2 m-0">{t("connectHint")}</p>
      <button type="submit" disabled={pending || !botReady} className={button("primary", "self-start")}>
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
                className={button("tinted")}
              >
                <ExternalLink aria-hidden="true" />
                {t("openChat")}
              </a>
              <a
                href={telegramLink(botUsername, state.code, true)}
                target="_blank"
                rel="noreferrer"
                className={button("secondary")}
              >
                <ExternalLink aria-hidden="true" />
                {t("openGroup")}
              </a>
              <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("linkHint")}</p>
            </>
          ) : (
            <>
              <code className="num bg-staff-bg rounded-xl p-3 text-lg break-all">
                {startCommand(state.code)}
              </code>
              <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("commandHint")}</p>
            </>
          )}
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-pomegranate m-0 font-semibold">
          {state.error === "rate_limited" ? t("rateLimited") : t("error")}
        </p>
      )}
    </form>
  );
}
