"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { createInvite, type InviteState } from "./actions";

const initial: InviteState = { token: null, error: false };

export function InviteForm({ baseUrl }: { baseUrl: string }) {
  const t = useTranslations("staff");
  const [state, action, pending] = useActionState(createInvite, initial);
  const link = state.token ? `${baseUrl}/invite/${state.token}` : null;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-sheet border border-line bg-white p-4">
      <h2 className="text-lg font-semibold">{t("inviteTitle")}</h2>
      <select name="role" defaultValue="manager" className="h-12 rounded-input border border-line-strong bg-white px-3" aria-label={t("inviteTitle")}>
        <option value="manager">{t("inviteManager")}</option>
        <option value="waiter">{t("inviteWaiter")}</option>
      </select>
      <button type="submit" disabled={pending} className="h-12 rounded-input bg-tarragon font-semibold text-white disabled:opacity-60">
        {t("inviteSubmit")}
      </button>
      {link && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <input readOnly value={link} className="h-12 rounded-input border border-line bg-mist px-3" data-testid="invite-link" aria-label={t("inviteLink")} />
          <p className="text-muted">{t("inviteLink")}</p>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-pomegranate">
          {t("error")}
        </p>
      )}
    </form>
  );
}
