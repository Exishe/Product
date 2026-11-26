"use client";

import { createContext, useContext, type ReactNode } from "react";
import styles from "./guest.module.css";

// What the guest sees while the menu is on its way (loading.tsx) and when it
// could not be opened (error.tsx). Both sit outside the café's own page, so
// they wear the default guest look and take their three lines of text from
// the menu route's layout, translated on the server.
export type MenuFallbackText = { loading: string; title: string; body: string; reload: string };

const Text = createContext<MenuFallbackText | null>(null);

export function MenuFallbackTextProvider({
  value,
  children,
}: {
  value: MenuFallbackText;
  children: ReactNode;
}) {
  return <Text.Provider value={value}>{children}</Text.Provider>;
}

const COLUMN = "mx-auto w-full max-w-[1240px] px-4 md:px-8";

/** A shape of the skeleton, decorative: grey, or an empty field on the beige band. */
function Bone({ className, field = false }: { className: string; field?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`block ${styles.skeleton} ${field ? "border [border-color:var(--guest-line-strong)]" : ""} ${className}`}
      style={field ? { background: "var(--guest-surface)" } : undefined}
    />
  );
}

// The menu's outline: the bar with the café's place, the beige band with the
// search and filter and a row of section chips, then a heading and three
// cards in the dishes' column, the same sizes as the real ones so nothing
// jumps when the menu arrives.
export function MenuSkeleton() {
  const text = useContext(Text);
  return (
    <div className="bg-page min-h-dvh" aria-busy="true">
      {text && (
        <p role="status" className="sr-only">
          {text.loading}
        </p>
      )}
      <div className="bg-surface">
        <div className={`${COLUMN} flex h-14 items-center justify-between`}>
          <Bone className="rounded-guest-sm h-6 w-28" />
          <Bone className="size-11 rounded-full" />
        </div>
      </div>
      <div className="border-line border-b bg-[var(--guest-band,var(--guest-chip))]">
        <div className={`${COLUMN} pt-3 pb-3`}>
          <div className="flex gap-2 lg:ml-auto lg:w-[26rem]">
            <Bone field className="rounded-guest-md h-11 flex-1" />
            <Bone field className="rounded-guest-md h-11 w-28 flex-none" />
          </div>
          <div className="mt-3 flex gap-2 overflow-hidden lg:hidden">
            <Bone className="rounded-guest-md h-11 w-32 flex-none" />
            <Bone className="rounded-guest-md h-11 w-28 flex-none" />
            <Bone className="rounded-guest-md h-11 w-32 flex-none" />
          </div>
        </div>
      </div>
      <div
        className={`${COLUMN} lg:grid lg:grid-cols-[11rem_minmax(0,1fr)_16rem] lg:gap-6 xl:grid-cols-[12rem_minmax(0,1fr)_17rem] xl:gap-8`}
      >
        <Bone className="rounded-guest-lg mt-5 hidden h-80 lg:block" />
        <div className="pt-5">
          <Bone className="rounded-guest-sm h-5 w-36" />
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Bone className="rounded-guest-lg aspect-[4/3] md:aspect-auto md:h-72" />
            <Bone className="rounded-guest-lg h-32 md:h-72" />
            <Bone className="rounded-guest-lg h-32 md:h-72" />
          </div>
        </div>
      </div>
    </div>
  );
}

// The menu did not open: a calm block, left-aligned in the middle of the
// screen, with one button that reloads the page.
export function MenuLoadFailed() {
  const text = useContext(Text);
  if (!text) return null;
  return (
    <main className="bg-page mx-auto flex min-h-dvh max-w-[30rem] flex-col justify-center px-6 py-12">
      <h1 className="display-face text-title m-0 text-[1.375rem] leading-[1.2]">{text.title}</h1>
      <p className="text-muted mt-2 text-body leading-[1.45]">{text.body}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={`${styles.cta} mt-6 inline-flex min-h-11 items-center justify-center self-start px-5 text-body font-semibold`}
      >
        {text.reload}
      </button>
    </main>
  );
}
