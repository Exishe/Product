"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthHeading } from "@/features/admin-ui/auth-heading";
import {
  FormError,
  SubmitButton,
  TextField,
  authInput,
  focusFirstInvalid,
  formValue,
} from "@/features/admin-ui/form-parts";
import { passwordProblem } from "@/lib/auth/staff-login";
import { getBrowserClient } from "@/lib/supabase/browser";

type Problem = "tooShort" | "tooLong" | "mismatch";

// The reset link opens this page with a one-time code; the browser client
// turns it into a session while it starts (PKCE, detectSessionInUrl). With a
// session the owner sets a new password and lands in the admin; without one
// (an old or used link, or another browser) the page says so and offers a
// new link, under a title that says what happened instead of "Set a new
// password".
export function ResetForm() {
  const t = useTranslations();
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "expired">("checking");
  const [problem, setProblem] = useState<{ field: "password" | "again"; key: Problem } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    const linkError =
      new URLSearchParams(window.location.search).has("error") || window.location.hash.includes("error=");
    getBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (live) setReady(data.session && !linkError ? "ok" : "expired");
      })
      .catch(() => live && setReady("expired"));
    return () => {
      live = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const next = formValue(form, "password");
    const again = formValue(form, "again");
    const weak = passwordProblem(next);
    const found = weak
      ? { field: "password" as const, key: weak === "short" ? ("tooShort" as const) : ("tooLong" as const) }
      : next !== again
        ? { field: "again" as const, key: "mismatch" as const }
        : null;
    setProblem(found);
    if (found) return focusFirstInvalid(form);
    setPending(true);
    setFailed(false);
    const { error } = await getBrowserClient().auth.updateUser({ password: next });
    if (error) {
      setPending(false);
      setFailed(true);
      return;
    }
    // The session cookie is set, so the admin's server components see it.
    router.replace("/admin");
  }

  const heading = (
    <AuthHeading title={t("auth.reset.title")} subtitle={<p className="m-0">{t("auth.reset.subtitle")}</p>} />
  );

  if (ready === "checking") {
    return (
      <>
        {heading}
        <p role="status" className="text-staff-label2 text-name m-0 flex items-center gap-2">
          <LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" />
          {t("auth.reset.checking")}
        </p>
      </>
    );
  }

  if (ready === "expired") {
    return (
      <>
        <div role="status" className="contents">
          <AuthHeading
            title={t("auth.reset.expiredTitle")}
            subtitle={<p className="m-0">{t("auth.reset.expired")}</p>}
          />
        </div>
        <Link
          href="/forgot-password"
          className="bg-ink inline-flex min-h-14 w-full items-center justify-center rounded-full px-6 text-base font-semibold text-white no-underline"
        >
          {t("auth.reset.newLink")}
        </Link>
      </>
    );
  }

  const error = (field: "password" | "again") =>
    problem?.field === field ? t(`staffAccount.${problem.key}`) : null;
  return (
    <>
      {heading}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t("auth.reset.password")}
          hint={problem?.field === "password" ? undefined : t("auth.signup.passwordHint")}
          error={error("password")}
          onChange={() => setProblem(null)}
          name="password"
          type="password"
          reveal={t("auth.showPassword")}
          inputClassName={authInput}
          autoComplete="new-password"
          required
        />
        <TextField
          label={t("auth.reset.again")}
          error={error("again")}
          onChange={() => setProblem(null)}
          name="again"
          type="password"
          reveal={t("auth.showPassword")}
          inputClassName={authInput}
          autoComplete="new-password"
          required
        />
        {failed && <FormError>{t("auth.reset.error")}</FormError>}
        <SubmitButton
          pending={pending}
          label={t("auth.reset.submit")}
          pendingLabel={t("auth.reset.pending")}
          className="min-h-14"
        />
      </form>
    </>
  );
}
