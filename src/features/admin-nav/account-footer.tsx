"use client";

import { clsx } from "clsx";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { signOut } from "@/features/auth/actions";
import { writeLocaleCookie } from "@/i18n/locale-cookie";
import { routing } from "@/i18n/routing";

export type Account = {
  /** The signed-in person's name, and their role in this café. */
  name: string;
  role: string;
  locale: string;
  languageLabel: string;
  languageNames: Record<string, string>;
  signOutLabel: string;
  accountLabel: string;
};

// The bottom of the sidebar and of the phone's Pages sheet: who is signed in,
// the admin's language (the same cookie the sign-in page sets; the page
// re-renders in place) and Sign out. 44 px rows, 15 px text.
export function AccountFooter({ account, className }: { account: Account; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = account.name.trim().slice(0, 1).toUpperCase() || "·";
  return (
    <section aria-label={account.accountLabel} className={clsx("flex flex-col gap-2", className)} data-testid="admin-account">
      <div className="flex min-h-11 min-w-0 items-center gap-2.5 px-3">
        <span
          aria-hidden="true"
          className="bg-ink grid size-8 shrink-0 place-items-center rounded-full text-[0.875rem] font-semibold text-white"
        >
          {initial}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-ink truncate text-label font-semibold" title={account.name}>
            {account.name}
          </span>
          <span className="text-staff-label2 truncate text-meta">{account.role}</span>
        </span>
      </div>
      <div
        role="group"
        aria-label={account.languageLabel}
        aria-busy={pending || undefined}
        className="bg-staff-fill grid grid-cols-3 gap-1 rounded-full p-1"
      >
        {routing.locales.map((l) => {
          const on = l === account.locale;
          return (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={on}
              onClick={() => {
                if (on) return;
                writeLocaleCookie(l);
                start(() => router.refresh());
              }}
              className={clsx(
                "min-h-11 rounded-full px-2 text-label font-semibold transition-colors duration-150 motion-reduce:transition-none",
                on ? "text-ink bg-white shadow-sm" : "text-staff-label2 hover:text-ink",
              )}
            >
              {account.languageNames[l]}
            </button>
          );
        })}
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="text-ink flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-label font-medium hover:bg-black/[0.04]"
          data-testid="admin-sign-out"
        >
          <LogOut aria-hidden="true" className="text-staff-label2 size-5 shrink-0" />
          {account.signOutLabel}
        </button>
      </form>
    </section>
  );
}
