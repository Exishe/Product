"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { createPairing, type PairingState } from "./actions";

const initial: PairingState = { code: null, error: false };
const field = "h-12 rounded-input border border-line-strong bg-white px-3";

export function PairDeviceForm({ pairUrl }: { pairUrl: string }) {
  const t = useTranslations("staff");
  const [state, action, pending] = useActionState(createPairing, initial);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-sheet border border-line bg-white p-4">
      <h2 className="text-lg font-semibold">{t("pairTitle")}</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("pairRole")}</span>
        <select name="role" className={field} defaultValue="kitchen">
          <option value="kitchen">{t("pairKitchen")}</option>
          <option value="waiter">{t("pairWaiter")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("pairLabel")}</span>
        <input name="label" required maxLength={60} className={field} />
      </label>
      <button type="submit" disabled={pending} className="h-12 rounded-input bg-tarragon font-semibold text-white disabled:opacity-60">
        {t("pairSubmit")}
      </button>
      {state.code && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="num text-kds-number font-bold tracking-widest" data-testid="pairing-code">
            {state.code}
          </p>
          <p className="text-muted">{t("pairCode", { url: pairUrl })}</p>
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
