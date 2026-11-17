"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { button, fieldLabel, input } from "@/features/admin-ui/styles";
import { useActionState } from "react";
import { signUp, type SignUpState } from "./actions";

const initial: SignUpState = { error: null };

export function SignUpForm({ next }: { next?: string }) {
  const t = useTranslations("auth.signup");
  const [state, action, pending] = useActionState(signUp, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("name")}</span>
        <input name="name" autoComplete="name" required maxLength={80} className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("email")}</span>
        <input name="email" type="email" autoComplete="email" required className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("password")}</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={input}
        />
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
