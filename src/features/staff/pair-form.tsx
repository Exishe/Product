"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  FormError,
  SubmitButton,
  TextField,
  focusFirstInvalid,
  formValue,
} from "@/features/admin-ui/form-parts";
import { field } from "@/features/admin-ui/styles";
import { getBrowserClient } from "@/lib/supabase/browser";

type PairError = "invalid_pairing_code" | "rate_limited" | "anonymous_session_required" | "failed";
type Redeemed = {
  member_id: string;
  role: "kitchen" | "waiter";
  location_id: string;
  station_id: string | null;
};

// Six 28 px monospace digits, centred in a 64 px field: the padding on the
// left equals the letter spacing the last digit carries on its right. The
// faint 000000 placeholder shows what goes in before anything is typed.
const codeInput = clsx(
  field,
  "h-16 pl-[0.35em] text-center font-mono text-[1.75rem]! tabular-nums tracking-[0.35em] placeholder:text-staff-label2/45",
);

// The device signs in anonymously, then redeems the owner's code (ADR-038).
export function PairForm() {
  const t = useTranslations("pair");
  const router = useRouter();
  const [error, setError] = useState<PairError | null>(null);
  const [badFormat, setBadFormat] = useState(false);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const busy = useRef(false);

  async function submit(code: string) {
    busy.current = true;
    setPending(true);
    setError(null);
    const fail = (reason: PairError) => {
      busy.current = false;
      setPending(false);
      setError(reason);
    };
    const supabase = getBrowserClient();
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) return fail("failed");
    }
    const { data, error: rpcError } = await supabase
      .schema("api")
      .rpc("redeem_device_pairing", { p_code: code });
    const result = data as ({ error?: PairError } & Partial<Redeemed>) | null;
    if (rpcError || !result) return fail("failed");
    if (result.error) return fail(result.error);
    router.replace(
      result.role === "kitchen" && result.station_id ? `/kitchen/${result.station_id}` : "/waiter",
    );
  }

  // Checked here (noValidate): the browser's own "match the format" bubble is English.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const code = formValue(form, "code").trim();
    const ok = /^[0-9]{6}$/.test(code);
    setBadFormat(!ok);
    if (!ok) return focusFirstInvalid(form);
    void submit(code);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField
        label={t("code")}
        error={badFormat ? t("errors.format") : null}
        onChange={(event) => {
          // Digits only: a letter or a space never appears in the field.
          setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6));
          setBadFormat(false);
        }}
        value={code}
        placeholder="000000"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        inputClassName={codeInput}
      />
      {error && <FormError>{t(`errors.${error}`)}</FormError>}
      <SubmitButton pending={pending} label={t("submit")} pendingLabel={t("pending")} className="min-h-14" />
    </form>
  );
}
