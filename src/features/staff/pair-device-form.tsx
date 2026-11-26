"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { button, fieldLabel, input } from "@/features/admin-ui/styles";
import { createPairing, type PairingState } from "./actions";

const initial: PairingState = { code: null, error: false };

export function PairDeviceForm({ pairUrl }: { pairUrl: string }) {
  const t = useTranslations("staff");
  const [state, action, pending] = useActionState(createPairing, initial);
  return (
    <form action={action} className="flex flex-col gap-5">
      {/* The sheet shows the title. */}
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("pairRole")}</span>
        <select name="role" className={input} defaultValue="kitchen">
          <option value="kitchen">{t("pairKitchen")}</option>
          <option value="waiter">{t("pairWaiter")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("pairLabel")}</span>
        <input name="label" required maxLength={60} className={input} />
      </label>
      <button type="submit" disabled={pending} className={button("primary", "sm:w-fit")}>
        {t("pairSubmit")}
      </button>
      {state.code && (
        <div className="bg-staff-bg flex flex-col items-start gap-2 rounded-xl p-4" aria-live="polite">
          <p
            className="num m-0 text-[3rem] leading-none font-bold tracking-[0.2em]"
            data-testid="pairing-code"
          >
            {state.code}
          </p>
          <p className="text-staff-label2 m-0 text-label break-words">
            {t("pairCode", { url: pairUrl })}
          </p>
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
