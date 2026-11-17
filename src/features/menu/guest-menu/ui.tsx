import { BellRing, Check, ChevronLeft, Minus, Plus, X } from "lucide-react";
import type { ElementType, ReactNode } from "react";
import type { Locale } from "@/i18n/routing";
import type { GuestTag, Text } from "./view-model";

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

// Icons are Lucide (ISC licence), imported one by one so only these ship.
const ICON = { size: 22, strokeWidth: 2, "aria-hidden": true } as const;
export const PlusIcon = () => <Plus {...ICON} />;
export const MinusIcon = () => <Minus {...ICON} />;
export const BackIcon = () => <ChevronLeft {...ICON} />;
export const CloseIcon = () => <X {...ICON} />;
export const CheckIcon = () => <Check size={16} strokeWidth={3} aria-hidden />;
export const BellIcon = () => <BellRing size={20} strokeWidth={2} aria-hidden />;

// Public URL of a dish photo in the menu-images bucket (public read). Reads
// the inlined env value directly: publicEnv() would pull zod into the guest
// bundle, which has a tight size budget.
export function dishPhotoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`;
}

const TAG_STYLES: Record<GuestTag, string> = {
  popular: "bg-chip text-ink",
  spicy: "bg-alert-tint text-alert",
  vegan: "bg-success-tint text-success",
  new: "bg-accent text-on-accent",
};

export function TagChip({ tag, label }: { tag: GuestTag; label: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs leading-5 font-semibold ${TAG_STYLES[tag]}`}>
      {label}
    </span>
  );
}

export function Notice({ tone, children }: { tone: "calm" | "busy" | "alert"; children: ReactNode }) {
  const tones = {
    calm: "border-chip bg-chip text-ink",
    busy: "border-glow bg-surface text-ink",
    alert: "border-alert bg-alert-tint text-ink",
  };
  return (
    <p className={`rounded-card border px-4 py-3 text-[0.9375rem] leading-snug ${tones[tone]}`}>
      {children}
    </p>
  );
}

let segmenter: Intl.Segmenter | null | undefined;
/** The first letter of a name (a whole grapheme), for the monogram plate. */
export function initial(text: string): string {
  if (segmenter === undefined)
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const first = segmenter ? segmenter.segment(text)[Symbol.iterator]().next().value?.segment : Array.from(text)[0];
  return (first ?? "").toLocaleUpperCase();
}

// A dish on its plate: the photo cropped round with a soft shadow, or, when
// the café has no photo, an empty plate with the dish's initial in the
// display face. Decorative: the dish name is always next to it.
export function Plate({
  src,
  name,
  size,
  lazy = true,
  muted = false,
  className = "",
}: {
  src: string | null;
  name: string;
  /** Intrinsic size in px (for width/height, so nothing shifts while loading). */
  size: number;
  lazy?: boolean;
  muted?: boolean;
  className?: string;
}) {
  const shade = muted ? "opacity-50 grayscale" : "";
  if (src)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized webp
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading={lazy ? "lazy" : undefined}
        decoding="async"
        className={`bg-plate shadow-plate aspect-square h-auto rounded-full object-cover ${shade} ${className}`}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={`bg-surface shadow-plate relative grid aspect-square place-items-center rounded-full [container-type:inline-size] ${shade} ${className}`}
    >
      <span className="border-line absolute inset-[9%] rounded-full border" />
      <span className="bg-plate absolute inset-[22%] rounded-full" />
      <span className="display-face text-accent-text relative text-[40cqw] leading-none">
        {initial(name)}
      </span>
    </span>
  );
}
