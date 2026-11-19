import { BellRing, Check, ChevronLeft, Minus, Plus, QrCode, X } from "lucide-react";
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

// A round − or + (cart, featured card, dish sheet, bill split): the card's
// own fill inside a ring that keeps 3:1 against it in every preset and with
// any brand (the field-border grey, darkened a quarter towards the ink), so
// the control never fades into a cream page. The glyph is the ink.
export const STEP =
  "bg-surface text-ink border-[1.5px] [border-color:color-mix(in_srgb,var(--guest-line-strong)_75%,var(--guest-ink))] disabled:text-line-strong disabled:[border-color:var(--guest-line-strong)] grid flex-none place-items-center rounded-full [&_svg]:size-[18px]";

// − n + : the dish sheet's and the featured card's quantity, 1 to `max`.
export function Stepper({
  value,
  max,
  onChange,
  labels,
  button,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  labels: { decrease: string; increase: string; quantity: string };
  /** The round buttons' size. */
  button: string;
}) {
  const round = `${STEP} ${button}`;
  return (
    <>
      <button
        type="button"
        className={round}
        aria-label={labels.decrease}
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <MinusIcon />
      </button>
      <output className="num min-w-7 text-center text-lg font-semibold" aria-label={labels.quantity}>
        {value}
      </output>
      <button
        type="button"
        className={round}
        aria-label={labels.increase}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <PlusIcon />
      </button>
    </>
  );
}

const DIET = "bg-success-tint text-success";
const TAG_STYLES: Record<GuestTag, string> = {
  popular: "bg-chip text-ink",
  spicy: "bg-alert-tint text-alert",
  vegan: DIET,
  vegetarian: DIET,
  gluten_free: DIET,
  lactose_free: DIET,
  new: "bg-badge text-on-badge",
};

export function TagChip({ tag, label }: { tag: GuestTag; label: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs leading-5 font-semibold ${TAG_STYLES[tag]}`}>
      {label}
    </span>
  );
}

// Guidance ("scan the QR code on your table") is a calm white card with a
// QR mark; only real failures (a dead QR code, a sold-out dish) get the alert.
export function Notice({
  tone,
  children,
}: {
  tone: "calm" | "info" | "busy" | "alert";
  children: ReactNode;
}) {
  const tones = {
    calm: "border-chip bg-chip text-ink",
    info: "bg-surface text-ink shadow-card flex items-center gap-3 [border-color:var(--guest-card-border)]",
    busy: "border-glow bg-surface text-ink",
    alert: "border-alert bg-alert-tint text-ink",
  };
  return (
    <p className={`rounded-card border px-4 py-3 text-[0.9375rem] leading-snug ${tones[tone]}`}>
      {tone === "info" && <QrCode size={22} strokeWidth={1.75} aria-hidden className="flex-none" />}
      {tone === "info" ? <span>{children}</span> : children}
    </p>
  );
}

// A dish on its plate (owner's reference, ADR-056): a round plate in the
// theme's plate colour (dark in Pure) with a soft drop shadow and a rim
// highlight; the photo fills it up to a thin rim, --guest-dish-inset (0 in
// Evening and Wine, where the photo is the plate), cropped round and shaded
// at its edge like food on a real plate seen from above. Without a photo:
// an empty plate, rim and well only (no letter: a monogram tells the guest
// nothing about the dish). Sections with no photos at all skip plates and
// use DishRow, a printed-menu line. Decorative:
// the dish name is always next to it. A grid, not positioned layers, so the
// caller's own position (absolute on a featured card) always applies.
// Photos are one 600 px WebP each (photo.ts; Storage's resizing is a paid
// feature), so there is no srcset: width/height and aspect-square keep the
// layout still while it loads. The first featured photo stays lazy (an eager
// one would hold back the load event, and the animation engine that waits
// for it) but is fetched at high priority once it is near the screen.
export function Plate({
  src,
  size,
  lazy = true,
  priority = false,
  muted = false,
  className = "",
}: {
  src: string | null;
  /** Intrinsic size in px (for width/height, so nothing shifts while loading). */
  size: number;
  lazy?: boolean;
  /** The page's first big photo: fetched at high priority (likely the LCP). */
  priority?: boolean;
  muted?: boolean;
  className?: string;
}) {
  const shade = muted ? "opacity-50 grayscale" : "";
  const layer = "col-start-1 row-start-1 rounded-full";
  return (
    <span
      aria-hidden="true"
      className={`bg-dish shadow-plate grid aspect-square place-items-center overflow-hidden rounded-full ${src ? "dish-photo" : ""} ${shade} ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized webp
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading={lazy ? "lazy" : undefined}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className={`${layer} aspect-square h-auto w-[calc(100%-2*var(--guest-dish-inset))] bg-[var(--guest-dish-well)] object-cover`}
        />
      ) : (
        <>
          <span className={`${layer} size-[82%] border [border-color:var(--guest-dish-rim)]`} />
          <span className={`${layer} size-[56%] bg-[var(--guest-dish-well)]`} />
        </>
      )}
    </span>
  );
}
