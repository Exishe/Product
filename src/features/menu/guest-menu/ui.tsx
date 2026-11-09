import type { ElementType, ReactNode } from "react";
import type { Locale } from "@/i18n/routing";
import type { Text } from "./view-model";

// Menu text in another language than the page (a missing translation) gets
// its own lang attribute, so screen readers and hyphenation get it right.
export function Txt({
  value,
  locale,
  as: Tag = "span",
  className,
  id,
}: {
  value: Text;
  locale: Locale;
  as?: ElementType;
  className?: string;
  id?: string;
}) {
  return (
    <Tag className={className} id={id} lang={value.lang === locale ? undefined : value.lang}>
      {value.text}
    </Tag>
  );
}

// Owner-typed text (the café name) carries no language; guess it from the script.
export function scriptLang(text: string): Locale | undefined {
  if (/[Ա-և]/.test(text)) return "hy";
  if (/[Ѐ-ӿ]/.test(text)) return "ru";
  return undefined;
}

const icon = { width: 22, height: 22, viewBox: "0 0 24 24", "aria-hidden": true } as const;

export function PlusIcon() {
  return (
    <svg {...icon}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function MinusIcon() {
  return (
    <svg {...icon}>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg {...icon}>
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...icon}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Notice({ tone, children }: { tone: "calm" | "busy" | "alert"; children: ReactNode }) {
  const tones = {
    calm: "border-tarragon-tint bg-tarragon-tint text-ink",
    busy: "border-apricot bg-white text-ink",
    alert: "border-pomegranate bg-pom-tint text-ink",
  };
  return <p className={`rounded-sheet border px-4 py-3 text-[0.9375rem] leading-snug ${tones[tone]}`}>{children}</p>;
}
