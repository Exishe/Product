"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { acceptInvite, type AcceptInviteState } from "./actions";

const initial: AcceptInviteState = { error: null };

export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("invite");
  const [state, action, pending] = useActionState(acceptInvite, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("name")}</span>
        <input name="name" required maxLength={80} autoComplete="name" className="h-12 rounded-input border border-line-strong bg-white px-3" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-chip bg-pom-tint px-3 py-2 text-pomegranate">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 rounded-input bg-tarragon font-semibold text-white disabled:opacity-60">
        {t("submit")}
      </button>
    </form>
  );
}
