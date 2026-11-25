"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState, type FormEvent } from "react";
import { FormError, SubmitButton, TextField, focusFirstInvalid, formValue } from "@/features/admin-ui/form-parts";
import { signUp, type SignUpState } from "./actions";

const initial: SignUpState = { error: null };

type Field = "name" | "email" | "password";
type Problem = "required" | "emailFormat" | "short";

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Checked here (noValidate) so the messages are ours, in the page's language,
// under the field they belong to; the server checks the same rules again.
function problems(form: HTMLFormElement): Partial<Record<Field, Problem>> {
  const name = formValue(form, "name").trim();
  const email = formValue(form, "email").trim();
  const password = formValue(form, "password");
  return {
    ...(!name && { name: "required" }),
    ...(!email ? { email: "required" } : !looksLikeEmail(email) && { email: "emailFormat" }),
    ...(!password ? { password: "required" } : password.length < 8 && { password: "short" }),
  };
}

export function SignUpForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(signUp, initial);
  const [bad, setBad] = useState<Partial<Record<Field, Problem>>>({});

  function check(event: FormEvent<HTMLFormElement>) {
    if (pending) return event.preventDefault();
    const form = event.currentTarget;
    const found = problems(form);
    setBad(found);
    if (Object.keys(found).length) {
      event.preventDefault();
      focusFirstInvalid(form);
    }
  }
  const clear = (name: Field) => () =>
    setBad((all) => {
      if (!all[name]) return all;
      const rest = { ...all };
      delete rest[name];
      return rest;
    });
  const message = (name: Field) => {
    const problem = bad[name];
    return problem === "required" ? t("required") : problem === "emailFormat" ? t("emailFormat") : null;
  };

  return (
    <form action={action} onSubmit={check} noValidate className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <TextField
        label={t("signup.name")}
        error={message("name")}
        onChange={clear("name")}
        name="name"
        autoComplete="name"
        required
        maxLength={80}
      />
      <TextField
        label={t("signup.email")}
        error={message("email")}
        onChange={clear("email")}
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <TextField
        label={t("signup.password")}
        hint={t("signup.passwordHint")}
        // Too short: the hint itself turns red, so the rule is said once.
        error={bad.password === "short" ? t("signup.passwordHint") : message("password")}
        onChange={clear("password")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      {state.error && <FormError>{t("signup.error")}</FormError>}
      <SubmitButton pending={pending} label={t("signup.submit")} pendingLabel={t("signup.pending")} />
    </form>
  );
}
