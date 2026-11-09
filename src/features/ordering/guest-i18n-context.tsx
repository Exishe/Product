"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@/i18n/routing";
import { createT, type GuestT } from "./guest-i18n";

type Value = { t: GuestT; locale: Locale };
const GuestI18n = createContext<Value | null>(null);

export type GuestMessages = Parameters<typeof createT>[0];

export function GuestI18nProvider({ locale, messages, children }: { locale: Locale; messages: GuestMessages; children: ReactNode }) {
  const value = useMemo(() => ({ t: createT(messages, locale), locale }), [messages, locale]);
  return <GuestI18n.Provider value={value}>{children}</GuestI18n.Provider>;
}

export function useGuestI18n(): Value {
  const value = useContext(GuestI18n);
  if (!value) throw new Error("useGuestI18n needs a GuestI18nProvider");
  return value;
}
