"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

const initial: SignInState = { error: null };

export function LoginForm() {
  const t = useTranslations("auth.login");
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("email")}</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-12 rounded-input border border-line-strong bg-white px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("password")}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-input border border-line-strong bg-white px-3"
        />
      </label>
      {state.error && (
        <p role="alert" className="rounded-chip bg-pom-tint px-3 py-2 text-pomegranate">
          {t("error")}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-input bg-tarragon font-semibold text-white disabled:opacity-60"
      >
        {pending ? t("pending") : t("submit")}
      </button>
    </form>
  );
}
