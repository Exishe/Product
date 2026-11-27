"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

export type SessionGuardTexts = {
  otherTitle: string;
  otherBody: string;
  signedOutTitle: string;
  signedOutBody: string;
  signIn: string;
};

// The account a staff sign-in is shown as: the login name for a staff login
// (<name>@staff.pativ.invalid), else the email.
const accountName = (email: string | undefined) =>
  email ? email.replace(/@staff\.pativ\.invalid$/, "") : "";

// A browser holds one sign-in for the whole site. Signing in as the waiter in
// another tab therefore replaces the kitchen's sign-in in this one, and the
// kitchen screen then reads as "no connection" and, after a reload, "no
// access". This notices it (on return to the tab and every 15 s, reading the
// sign-in the browser holds, no request) and says what happened, with one tap
// to sign back in here.
export function SessionGuard({ userId, texts }: { userId: string; texts: SessionGuardTexts }) {
  const [state, setState] = useState<{ kind: "ok" } | { kind: "other"; name: string } | { kind: "out" }>({
    kind: "ok",
  });

  useEffect(() => {
    let alive = true;
    const db = getBrowserClient();
    const check = async () => {
      try {
        const { data } = await db.auth.getSession();
        if (!alive) return;
        const user = data.session?.user;
        if (!user) setState({ kind: "out" });
        else if (user.id !== userId) setState({ kind: "other", name: accountName(user.email) });
        else setState({ kind: "ok" });
      } catch {
        // can't read the sign-in right now: leave the screen as it is
      }
    };
    void check();
    const onReturn = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    const timer = window.setInterval(() => void check(), 15_000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      window.clearInterval(timer);
    };
  }, [userId]);

  if (state.kind === "ok") return null;
  const here = typeof window === "undefined" ? "/" : window.location.pathname;
  const title = state.kind === "other" ? texts.otherTitle : texts.signedOutTitle;
  const body =
    state.kind === "other" ? texts.otherBody.replace("{account}", state.name) : texts.signedOutBody;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-guard-title"
      data-testid="session-guard"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
    >
      <div className="grid w-full max-w-md gap-4 rounded-2xl bg-white p-6 text-[#1c1c1e] shadow-xl">
        <h2 id="session-guard-title" className="m-0 text-[1.375rem] leading-tight font-semibold">
          {title}
        </h2>
        <p className="m-0 text-[1.0625rem] leading-relaxed">{body}</p>
        <a
          href={`/login?next=${encodeURIComponent(here)}`}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#1c1c1e] px-6 text-[1.0625rem] font-semibold text-white"
        >
          {texts.signIn}
        </a>
      </div>
    </div>
  );
}
