"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import {
  FormError,
  SubmitButton,
  TextField,
  authInput,
  focusFirstInvalid,
  formValue,
} from "@/features/admin-ui/form-parts";
import { alert } from "@/features/admin-ui/styles";
import { getBrowserClient } from "@/lib/supabase/browser";

// The owner's email gets a reset link (Supabase Auth's own mail, free tier).
// The answer is the same whether or not an account uses the address, so the
// form never tells a stranger who has an account here.
export function ForgotForm() {
  const t = useTranslations("auth");
  const [problem, setProblem] = useState<"required" | "emailFormat" | null>(null);
  const [state, setState] = useState<{ sent: string } | "error" | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const email = formValue(form, "email").trim();
    const bad = !email ? "required" : z.email().safeParse(email).success ? null : "emailFormat";
    setProblem(bad);
    if (bad) return focusFirstInvalid(form);
    setPending(true);
    setState(null);
    const { error } = await getBrowserClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    setState(error ? "error" : { sent: email });
  }

  if (state && state !== "error") {
    return (
      <p
        role="status"
        className={`${alert.base} bg-tarragon-tint text-ink text-name [&_svg]:text-tarragon leading-normal`}
      >
        <CircleCheck aria-hidden="true" />
        {t("forgot.sent", { email: state.sent })}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField
        label={t("forgot.email")}
        error={problem ? t(problem) : null}
        onChange={() => setProblem(null)}
        name="email"
        type="email"
        inputClassName={authInput}
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      {state === "error" && <FormError>{t("forgot.error")}</FormError>}
      <SubmitButton
        pending={pending}
        label={t("forgot.submit")}
        pendingLabel={t("forgot.pending")}
        className="min-h-14"
      />
    </form>
  );
}
