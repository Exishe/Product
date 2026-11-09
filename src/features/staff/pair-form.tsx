"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

type PairError = "invalid_pairing_code" | "rate_limited" | "anonymous_session_required" | "failed";
type Redeemed = { member_id: string; role: "kitchen" | "waiter"; location_id: string; station_id: string | null };

// The device signs in anonymously, then redeems the owner's code (ADR-038).
export function PairForm() {
  const t = useTranslations("pair");
  const router = useRouter();
  const [error, setError] = useState<PairError | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    const code = String(form.get("code") ?? "").trim();
    const supabase = getBrowserClient();
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        setPending(false);
        setError("failed");
        return;
      }
    }
    const { data, error: rpcError } = await supabase.schema("api").rpc("redeem_device_pairing", { p_code: code });
    const result = data as ({ error?: PairError } & Partial<Redeemed>) | null;
    if (rpcError || !result) {
      setPending(false);
      setError("failed");
      return;
    }
    if (result.error) {
      setPending(false);
      setError(result.error);
      return;
    }
    router.replace(result.role === "kitchen" && result.station_id ? `/kitchen/${result.station_id}` : "/waiter");
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("code")}</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className="num h-16 rounded-input border border-line-strong bg-white px-3 text-center text-3xl tracking-[0.4em]"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-chip bg-pom-tint px-3 py-2 text-pomegranate">
          {t(`errors.${error}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-14 rounded-input bg-tarragon text-lg font-semibold text-white disabled:opacity-60">
        {pending ? t("pending") : t("submit")}
      </button>
    </form>
  );
}
