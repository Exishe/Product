"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { writeLocaleCookie } from "@/i18n/locale-cookie";
import { routing } from "@/i18n/routing";
import { localeOption } from "./brand";

// Sign-in, sign-up, pairing and the 404 have no locale in the URL: the switch
// stores the choice in the language cookie and re-renders the page in place,
// <html lang> included, so whatever was typed stays in the fields.
export function LocaleSwitch({
  current,
  label,
  names,
}: {
  current: string;
  label: string;
  names: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={label} aria-busy={pending || undefined} className="flex items-center">
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === current}
          onClick={() => {
            if (l === current) return;
            writeLocaleCookie(l);
            start(() => router.refresh());
          }}
          className={localeOption}
        >
          {names[l]}
        </button>
      ))}
    </div>
  );
}
