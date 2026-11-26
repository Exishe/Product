import { BellRing, Check, ChefHat, ChevronLeft, Heart, Minus, Plus, QrCode, X } from "./icons";
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
/**
 * The one section heading of the guest pages' long pages (the status page's
 * «Ձեր պատվերը», «Նախորդ պատվերները», «Կարող եք ավելացնել», «Խաղեր սպասելիս»):
 * 20 px in the display face.
 */
export const SECTION_TITLE = "display-face text-heading leading-[1.2]";

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
  "bg-surface text-ink border [border-color:var(--guest-line-strong)] hover:[border-color:var(--guest-ink)] disabled:text-line-strong disabled:[border-color:var(--guest-line)] grid flex-none place-items-center rounded-full [&_svg]:size-[14px]";

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
      <output className="num min-w-7 text-center text-name font-semibold" aria-label={labels.quantity}>
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

// Tags (owner, Nov 2026: no pill badges everywhere; ADR-094 area pass: one
// treatment). Every tag is a word in the dish's meta line, joined with « · ».
// The two that single a dish out, «Սիրված» and the chef's pick, lead the line
// as a label (ADR-097): capitalised, in the accent colour, at the meta's own
// size and weight, after a small mark (a heart, a chef's hat), so they never
// read as a second line of the dish's name. No box, no pill, no corner label
// clipped on a narrow photo. The same on a row, a card and the sheet.
export const BADGE_TAGS: readonly GuestTag[] = ["popular", "chefs_pick"];
export const isBadgeTag = (tag: GuestTag) => BADGE_TAGS.includes(tag);

/** The badge tags first, in their fixed order, then the rest as the café set them. */
export const orderTags = (tags: readonly GuestTag[]): GuestTag[] => [
  ...BADGE_TAGS.filter((b) => tags.includes(b)),
  ...tags.filter((tag) => !isBadgeTag(tag)),
];

export function TagBadge({ tag, label }: { tag: GuestTag; label: string }) {
  const Mark = tag === "chefs_pick" ? ChefHat : Heart;
  return (
    <span className="text-accent-text inline-flex items-baseline gap-1" data-badge={tag}>
      <Mark size={14} strokeWidth={2.25} className="flex-none translate-y-[2px] self-start" />
      {label}
    </span>
  );
}

/** A tag in a meta line: a label for the two badge tags, a plain muted word otherwise. */
export function TagChip({ tag, label }: { tag: GuestTag; label: string }) {
  return isBadgeTag(tag) ? <TagBadge tag={tag} label={label} /> : <span>{label}</span>;
}

/**
 * Short facts in one muted 15 px line, joined with « · » (portion, tags, sold
 * out). Each fact keeps its words together, and its « · » travels with it: a
 * fact that wraps takes its dot to the next line, where the line's start
 * clips it (the row is shifted left by one gap inside a clipping box), so no
 * line ever ends or starts with a dangling dot.
 */
export function MetaLine({ parts, className = "" }: { parts: ReactNode[]; className?: string }) {
  const shown = parts.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <span className={`text-muted block overflow-hidden text-label leading-[1.4] ${className}`}>
      <span className="-ml-[1.125rem] flex flex-wrap gap-y-0.5">
        {shown.map((part, i) => (
          <span
            key={i}
            className="relative pl-[1.125rem] whitespace-nowrap before:absolute before:left-[0.375rem] before:[content:'·'_/_'']"
          >
            {part}
          </span>
        ))}
      </span>
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
    <p className={`rounded-card border px-4 py-3 text-body leading-[1.45] ${tones[tone]}`}>
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
