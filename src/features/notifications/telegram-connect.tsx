"use client";

import { ExternalLink, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Section } from "@/features/admin-ui/page";
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
    // The shared group header (heading, hint, hairline), as on every admin page.
    <Section title={t("connectTitle")} hint={t("connectHint")} id="tg-connect-title">
      <form action={action} className="flex flex-col gap-4">
        <button type="submit" disabled={pending || !botReady} className={button("primary", "self-start max-sm:w-full")}>
          {t("connect")}
        </button>
        {/* Why the button is off, right under it: no separate callout above. */}
        {!botReady && (
          <p role="status" className="text-ink m-0 flex items-start gap-2" data-testid="bot-not-ready">
            <Info aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
            {t("botNotReady")}
          </p>
        )}
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
                <p className="text-staff-label2 m-0 text-label">{t("linkHint")}</p>
              </>
            ) : (
              <>
                <code className="num bg-staff-bg rounded-xl p-3 text-lg break-all">
                  {startCommand(state.code)}
                </code>
                <p className="text-staff-label2 m-0 text-label">{t("commandHint")}</p>
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
    </Section>
  );
}
