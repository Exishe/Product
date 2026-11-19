"use client";

import { CircleAlert, Copy, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useToast } from "@/features/admin-ui/toast";
import { button, fieldLabel, input } from "@/features/admin-ui/styles";
import { createInvite, type InviteState } from "./actions";

const initial: InviteState = { token: null, error: false };

export function InviteForm({ baseUrl }: { baseUrl: string }) {
  const t = useTranslations("staff");
  const toast = useToast();
  const [state, action, pending] = useActionState(createInvite, initial);
  const link = state.token ? `${baseUrl}/invite/${state.token}` : null;
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl bg-white p-4 sm:p-5">
      <h2 className="m-0 flex items-center gap-2 text-[1.25rem] font-bold">
        <UserPlus aria-hidden="true" className="text-ink size-5" />
        {t("inviteTitle")}
      </h2>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("inviteRole")}</span>
        <select name="role" defaultValue="manager" className={input}>
          <option value="manager">{t("inviteManager")}</option>
          <option value="waiter">{t("inviteWaiter")}</option>
        </select>
      </label>
      <button type="submit" disabled={pending} className={button("primary")}>
        {t("inviteSubmit")}
      </button>
      {link && (
        <div className="bg-staff-bg flex flex-col gap-2 rounded-xl p-4" aria-live="polite">
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              className={`${input} num text-[0.9375rem]`}
              data-testid="invite-link"
              aria-label={t("inviteLink")}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              aria-label={t("copy")}
              onClick={() =>
                void navigator.clipboard?.writeText(link).then(
                  () => toast(t("copied")),
                  () => toast(t("error"), "error"),
                )
              }
              className={button("secondary", "shrink-0 px-3")}
            >
              <Copy aria-hidden="true" />
            </button>
          </div>
          <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("inviteLink")}</p>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-pomegranate m-0 flex items-center gap-2 font-semibold">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {t("error")}
        </p>
      )}
    </form>
  );
}
