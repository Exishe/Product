"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { button, fieldLabel, input } from "@/features/admin-ui/styles";
import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

const initial: SignInState = { error: null };

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth.login");
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("email")}</span>
        <input
          name="email"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("password")}</span>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state.error && (
        <p
          role="alert"
          className="bg-pom-tint text-pomegranate m-0 flex items-start gap-2 rounded-xl px-3 py-2.5"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("error")}
        </p>
      )}
      <button type="submit" disabled={pending} className={button("primary", "mt-1")}>
        {pending ? t("pending") : t("submit")}
      </button>
    </form>
  );
}
