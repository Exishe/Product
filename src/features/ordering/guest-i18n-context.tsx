"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Locale } from "@/i18n/routing";
import { createT, type GuestT } from "./guest-i18n";
import { chosenLocale, localeCookie, localeOfPath, withLocale } from "./guest-locale";

type Value = {
  t: GuestT;
  locale: Locale;
  /**
   * Shows the page in another language without loading it again (ADR-092):
   * the cart, an open dish or order view, a note being typed and the scroll
   * position all stay. False when that language's texts aren't on the page;
   * the caller then follows its link as before.
   */
  switchLocale: (locale: Locale) => boolean;
};
const GuestI18n = createContext<Value | null>(null);

export type GuestMessages = Parameters<typeof createT>[0];
/** The guest texts of every language the café offers, so a switch needs no request. */
export type GuestCatalog = Partial<Record<Locale, GuestMessages>>;

export function GuestI18nProvider({
  locale: served,
  messages,
  catalog,
  children,
}: {
  /** The language the server rendered this page in (from the address). */
  locale: Locale;
  messages: GuestMessages;
  catalog?: GuestCatalog;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState<Locale>(served);
  // The server rendered the page again in another language (a refresh after
  // the address changed): follow it.
  const [lastServed, setLastServed] = useState<Locale>(served);
  if (served !== lastServed) {
    setLastServed(served);
    setLocale(served);
  }

  const textsFor = useCallback(
    (l: Locale): GuestMessages | undefined => (l === served ? messages : catalog?.[l]),
    [served, messages, catalog],
  );

  const current = useRef(locale);
  useEffect(() => {
    current.current = locale;
  }, [locale]);

  // Shows `l` and makes the address, <html lang> and the language cookie agree.
  const apply = useCallback((l: Locale) => {
    current.current = l;
    setLocale(l);
    try {
      document.documentElement.lang = l;
      document.cookie = localeCookie(l);
    } catch {
      // cookies blocked: the address still carries the language
    }
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const there = withLocale(here, l);
    // Replace, not push: Back leaves the page instead of undoing the language.
    if (there !== here) window.history.replaceState(null, "", there);
  }, []);

  const switchLocale = useCallback(
    (l: Locale) => {
      if (l === current.current) return true;
      if (!textsFor(l)) return false;
      apply(l);
      return true;
    },
    [apply, textsFor],
  );

  // Back/Forward and a page shown again from the router's cache can carry an
  // address in the language the guest had before switching: keep their latest
  // choice (the cookie). Before paint, so the old language never flashes.
  useLayoutEffect(() => {
    const follow = () => {
      const chosen = chosenLocale(document.cookie);
      if (!chosen || !textsFor(chosen)) return;
      if (chosen !== current.current || localeOfPath(window.location.pathname) !== chosen) apply(chosen);
    };
    follow();
    // After the router has handled the same popstate.
    const onPop = () => window.setTimeout(follow, 0);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [apply, textsFor]);

  const shown = textsFor(locale) ?? messages;
  const value = useMemo(
    () => ({ t: createT(shown, locale), locale, switchLocale }),
    [shown, locale, switchLocale],
  );
  return <GuestI18n.Provider value={value}>{children}</GuestI18n.Provider>;
}

export function useGuestI18n(): Value {
  const value = useContext(GuestI18n);
  if (!value) throw new Error("useGuestI18n needs a GuestI18nProvider");
  return value;
}
