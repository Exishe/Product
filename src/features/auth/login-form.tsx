"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState, type FormEvent } from "react";
import { FormError, SubmitButton, TextField, focusFirstInvalid, formValue } from "@/features/admin-ui/form-parts";
import { signIn, type SignInState } from "./actions";

const initial: SignInState = { error: null };

type Field = "email" | "password";

// The browser's own validation bubbles are English, so the form checks empty
// fields itself (noValidate) and says so under each field.
export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(signIn, initial);
  const [missing, setMissing] = useState<Field[]>([]);

  function check(event: FormEvent<HTMLFormElement>) {
    if (pending) return event.preventDefault();
    const form = event.currentTarget;
    const empty = (["email", "password"] as const).filter((name) => !formValue(form, name).trim());
    setMissing(empty);
    if (empty.length) {
      event.preventDefault();
      focusFirstInvalid(form);
    }
  }
  const clear = (name: Field) => () =>
    setMissing((list) => (list.includes(name) ? list.filter((f) => f !== name) : list));
  const required = (name: Field) => (missing.includes(name) ? t("required") : null);

  return (
    <form action={action} onSubmit={check} noValidate className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <TextField
        label={t("login.email")}
        error={required("email")}
        onChange={clear("email")}
        name="email"
        type="text"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        defaultValue={state.login}
      />
      <TextField
        label={t("login.password")}
        error={required("password")}
        onChange={clear("password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state.error && <FormError>{t(state.error === "busy" ? "login.busy" : "login.error")}</FormError>}
      <SubmitButton pending={pending} label={t("login.submit")} pendingLabel={t("login.pending")} />
    </form>
  );
}
