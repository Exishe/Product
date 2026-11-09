"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { signUp, type SignUpState } from "./actions";

const initial: SignUpState = { error: null };
const field = "h-12 rounded-input border border-line-strong bg-white px-3";

export function SignUpForm() {
  const t = useTranslations("auth.signup");
  const [state, action, pending] = useActionState(signUp, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("name")}</span>
        <input name="name" autoComplete="name" required maxLength={80} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("email")}</span>
        <input name="email" type="email" autoComplete="email" required className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("password")}</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={field} />
      </label>
      {state.error && (
        <p role="alert" className="rounded-chip bg-pom-tint px-3 py-2 text-pomegranate">
          {t("error")}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 rounded-input bg-tarragon font-semibold text-white disabled:opacity-60">
        {pending ? t("pending") : t("submit")}
      </button>
    </form>
  );
}
