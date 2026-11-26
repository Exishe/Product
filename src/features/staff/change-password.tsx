"use client";

import { clsx } from "clsx";
import { CircleAlert, CircleCheck, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { passwordProblem } from "@/lib/auth/staff-login";
import { getBrowserClient } from "@/lib/supabase/browser";

// "Change password" for a staff login on the waiter and kitchen screens
// (ADR-067): the signed-in login sets its own new password through Supabase
// Auth. Needs the `staffAccount` messages.
export function ChangePassword({
  triggerClassName,
  tone,
  withLabel,
}: {
  triggerClassName: string;
  tone: "staff" | "kitchen";
  /** The words next to the key, for a row in a menu or sheet. */
  withLabel?: boolean;
}) {
  const t = useTranslations("staffAccount");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState<"mismatch" | "tooShort" | "tooLong" | "error" | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    setError(null);
    setSaved(false);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const next = String(data.get("password") ?? "");
    const again = String(data.get("again") ?? "");
    const problem = passwordProblem(next);
    if (problem) return setError(problem === "short" ? "tooShort" : "tooLong");
    if (next !== again) return setError("mismatch");
    setError(null);
    setPending(true);
    const { error: failed } = await getBrowserClient().auth.updateUser({ password: next });
    setPending(false);
    if (failed) return setError("error");
    form.reset();
    setSaved(true);
  };

  const card = tone === "kitchen" ? "bg-basalt-2 text-slip" : "bg-staff-bg text-ink";
  const field =
    "h-12 w-full min-w-0 rounded-xl border border-staff-field bg-white px-3 text-[1.0625rem] text-[#111]";
  return (
    <>
      <button
        type="button"
        data-testid="change-password-open"
        aria-label={withLabel ? undefined : t("changePassword")}
        title={withLabel ? undefined : t("changePassword")}
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        <KeyRound aria-hidden="true" className="size-5 shrink-0" />
        {withLabel && t("changePassword")}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        className={clsx(
          "m-auto w-[calc(100vw-2rem)] max-w-md rounded-[var(--radius-soft)] p-0 shadow-[var(--shadow-soft-float)] backdrop:bg-black/40",
          card,
        )}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5">
          <h2 id={titleId} className="m-0 flex items-center gap-2 text-[1.25rem] font-bold">
            <KeyRound aria-hidden="true" className="size-5 shrink-0" />
            {t("changePassword")}
          </h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.9375rem] font-semibold opacity-80">{t("newPassword")}</span>
            <input name="password" type="password" autoComplete="new-password" required className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.9375rem] font-semibold opacity-80">{t("repeat")}</span>
            <input name="again" type="password" autoComplete="new-password" required className={field} />
          </label>
          {error && (
            <p role="alert" className="m-0 flex items-start gap-2 font-semibold text-[#d9534f]">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t(error)}
            </p>
          )}
          {saved && (
            <p role="status" className="m-0 flex items-center gap-2 font-semibold">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
              {t("saved")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#111] px-5 text-[1.0625rem] font-semibold text-white disabled:opacity-50"
            >
              {pending ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-black/10 px-5 text-[1.0625rem] font-semibold"
            >
              {t("close")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
