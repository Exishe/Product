"use client";

import { useRef, useState, type CSSProperties } from "react";
import motionStyles from "@/features/guest-theme/motion/motion.module.css";
import { useReveal } from "@/features/guest-theme/motion/reveal";
import { useTilt } from "@/features/guest-theme/motion/tilt";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { MAX_QUANTITY } from "@/features/ordering/cart";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { MinusIcon, PlusIcon, Plate, TagChip, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// One dish as a card (owner's pick, menu-layout.webp): the dish on a round
// plate, its name in the display face, the price, portion and tags, and a
// round "+" hanging off the card's corner. The whole card opens the dish
// sheet (a stretched button); "+" adds a simple dish at once, or opens the
// sheet when there's a choice to make. A featured dish (popular, with a
// photo) spans the row, its plate bleeding off the card's edge. Cards rise
// in as they come into view and tilt towards the pointer or finger, with a
// glare and a turn of the plate (Tilted Card). The first few (`index`) rise
// at first paint in CSS; any card below the fold waits for it (reveal.ts).
//
// In Pure (`pure`, ADR-056 and the owner's template) a card adds with a
// quiet "+ Add" under its price instead of the corner button, and the
// featured card is the template's expanded card: two columns wide from
// 360 px, the photo bleeding off its top-right corner with the text flowing
// round it, chips, the description, a larger price, a − n + stepper and a
// filled "Add". Long names wrap between words and hyphenate (the text's
// lang is set), breaking inside a word only when it can't fit at all.
const ENTER_FIRST = 6;
const WRAP = "break-words hyphens-auto";

export function DishCard({
  item,
  canOrder,
  featured = false,
  pure = false,
  priority = false,
  index = ENTER_FIRST,
  onOpen,
  onQuickAdd,
}: {
  item: GuestItem;
  canOrder: boolean;
  featured?: boolean;
  /** The Pure preset (soft): the template's card and featured card. */
  pure?: boolean;
  /** The page's first featured photo: loaded at once. */
  priority?: boolean;
  /** Its place on the page: the first few rise at first paint. */
  index?: number;
  onOpen: (item: GuestItem) => void;
  onQuickAdd: (item: GuestItem, from: HTMLElement, quantity?: number) => void;
}) {
  const { t, locale } = useGuestI18n();
  const card = useRef<HTMLElement>(null);
  const row = useRef<HTMLLIElement>(null);
  const early = index < ENTER_FIRST;
  useTilt(card, featured ? { max: 6, touchMax: 4, scale: 1.015 } : undefined);
  useReveal(row);
  const needsChoice = item.groups.some((g) => g.min > 0);
  const showAdd = canOrder && !item.soldOut;
  const photo = item.image ? dishPhotoUrl(item.image) : null;
  const muted = item.soldOut ? "text-muted" : "";
  const [quantity, setQuantity] = useState(1);
  const expanded = featured && pure;
  const addLabel = t("menu.add", { name: item.name.text });
  const add = (from: HTMLElement) => {
    if (needsChoice) return onOpen(item);
    onQuickAdd(item, from, quantity);
    setQuantity(1);
  };

  const facts = (
    <span
      className={`text-muted flex flex-wrap items-center gap-1.5 text-[0.8125rem] ${featured ? "" : "justify-center"}`}
    >
      {item.soldOut && <span className="text-alert font-semibold">{t("menu.soldOut")}</span>}
      {item.portion && (
        <span className={pure ? "bg-chip text-ink rounded-full px-2.5 text-xs leading-6 font-semibold" : ""}>
          {t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}
        </span>
      )}
      {item.tags.map((tag) => (
        <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
      ))}
    </span>
  );
  const price = (
    <span
      className={`num text-accent-text font-semibold whitespace-nowrap ${featured ? (pure ? "text-[1.625rem]" : "text-[1.375rem]") : "text-[0.9375rem]"} ${muted}`}
    >
      {formatAmd(item.price, locale)}
    </span>
  );

  const expandedBody = (
    <>
      <Plate
        src={photo}
        name={item.name.text}
        size={360}
        lazy={!priority}
        priority={priority}
        muted={item.soldOut}
        className={`pointer-events-none absolute ${styles.featurePlate} ${motionStyles.spin}`}
      />
      {/* The plate's footprint: the text flows round it, then under it. */}
      <span aria-hidden="true" className={styles.featureGap} />
      <Txt
        value={item.name}
        locale={locale}
        className={`display-face block text-[clamp(1.625rem,7.5cqw,2.75rem)] leading-[1.06] ${WRAP} ${muted}`}
      />
      <span className="mt-3 block">{facts}</span>
      {item.description && (
        <Txt
          value={item.description}
          locale={locale}
          className={`text-muted mt-3 line-clamp-4 block text-[0.875rem] leading-relaxed ${WRAP}`}
        />
      )}
      <span className="mt-4 block">{price}</span>
    </>
  );

  return (
    <li
      ref={row}
      className={`${featured ? (pure ? "col-span-full min-[360px]:col-span-2" : "col-span-full") : "min-w-0"} ${motionStyles.reveal} ${early ? motionStyles.enter : ""}`}
      style={early ? ({ "--i": index } as CSSProperties) : undefined}
      data-testid="dish"
      data-dish-id={item.id}
      data-featured={featured || undefined}
    >
      <article
        ref={card}
        className={`group bg-surface text-ink shadow-card relative isolate h-full border [border-color:var(--guest-card-border)] ${
          featured ? "rounded-feature overflow-hidden" : "rounded-card"
        } ${expanded ? `flex flex-col ${styles.feature}` : ""}`}
      >
        <button
          type="button"
          disabled={item.soldOut}
          onClick={() => onOpen(item)}
          className={`w-full rounded-[inherit] disabled:cursor-default ${
            expanded
              ? `flow-root flex-1 text-left ${styles.featurePad}`
              : featured
                ? "block h-full min-h-[15rem] p-5 pr-[44%] text-left sm:min-h-[17rem] sm:p-7 sm:pr-[42%]"
                : `block h-full px-3 pt-4 text-center sm:px-4 ${pure && showAdd ? "pb-14" : "pb-7"}`
          }`}
        >
          {expanded ? (
            expandedBody
          ) : featured ? (
            <>
              <Plate
                src={photo}
                name={item.name.text}
                size={360}
                lazy={!priority}
                priority={priority}
                muted={item.soldOut}
                className={`pointer-events-none absolute top-[-14%] right-[-16%] w-[60%] max-w-[22rem] sm:top-[-18%] sm:right-[-10%] sm:w-[48%] ${motionStyles.spin}`}
              />
              <Txt
                value={item.name}
                locale={locale}
                className={`display-face block text-[2rem] leading-[1.04] ${WRAP} sm:text-[2.625rem] ${muted}`}
              />
              <span className="mt-2 block">{facts}</span>
              {item.description && (
                <Txt
                  value={item.description}
                  locale={locale}
                  className="text-muted mt-3 line-clamp-3 block text-[0.8125rem] leading-relaxed"
                />
              )}
              <span className="mt-4 block pr-12">{price}</span>
            </>
          ) : (
            <>
              <Plate
                src={photo}
                name={item.name.text}
                size={240}
                muted={item.soldOut}
                className={`mx-auto w-[74%] max-w-[10.5rem] ${motionStyles.spin}`}
              />
              <Txt
                value={item.name}
                locale={locale}
                className={`display-face mt-4 block text-[1.25rem] leading-[1.12] ${WRAP} sm:text-[1.375rem] ${muted}`}
              />
              <span className="mt-1 block">{price}</span>
              {(item.portion || item.tags.length > 0 || item.soldOut) && (
                <span className="mt-1.5 block">{facts}</span>
              )}
            </>
          )}
        </button>
        <span aria-hidden="true" className={motionStyles.glare} />
        {showAdd && expanded ? (
          <div className={`relative z-10 flex flex-wrap items-center gap-3 ${styles.featureActions}`}>
            {!needsChoice && (
              <span
                role="group"
                aria-label={item.name.text}
                className="inline-flex flex-none items-center gap-1"
              >
                <button
                  type="button"
                  className="bg-surface shadow-card disabled:text-line-strong grid size-11 place-items-center rounded-full [&_svg]:size-[18px]"
                  aria-label={t("sheet.decrease")}
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <MinusIcon />
                </button>
                <output
                  className="num min-w-7 text-center text-lg font-semibold"
                  aria-label={t("sheet.quantity")}
                >
                  {quantity}
                </output>
                <button
                  type="button"
                  className="bg-surface shadow-card disabled:text-line-strong grid size-11 place-items-center rounded-full [&_svg]:size-[18px]"
                  aria-label={t("sheet.increase")}
                  disabled={quantity >= MAX_QUANTITY}
                  onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                >
                  <PlusIcon />
                </button>
              </span>
            )}
            <button
              type="button"
              className="bg-accent text-on-accent rounded-pill inline-flex min-h-12 items-center gap-2 px-6 font-semibold active:scale-95 [&_svg]:size-[18px]"
              aria-label={addLabel}
              aria-haspopup={needsChoice ? "dialog" : undefined}
              onClick={(e) => add(e.currentTarget)}
            >
              <PlusIcon />
              {t("sheet.add")}
            </button>
          </div>
        ) : showAdd && pure ? (
          <button
            type="button"
            className="text-ink hover:bg-chip rounded-pill absolute inset-x-0 bottom-2 z-10 mx-auto inline-flex min-h-11 w-fit items-center gap-1 px-3.5 text-[0.8125rem] font-semibold active:scale-95 [&_svg]:size-4"
            aria-label={addLabel}
            aria-haspopup={needsChoice ? "dialog" : undefined}
            onClick={(e) => add(e.currentTarget)}
          >
            <PlusIcon />
            {t("sheet.add")}
          </button>
        ) : showAdd ? (
          <button
            type="button"
            className={`bg-add text-on-add ring-page absolute z-10 grid size-12 place-items-center rounded-full shadow-[var(--guest-add-shadow)] ring-4 active:scale-90 ${
              featured ? "right-4 bottom-4 sm:right-6 sm:bottom-6" : "-right-2 -bottom-3"
            }`}
            aria-label={addLabel}
            aria-haspopup={needsChoice ? "dialog" : undefined}
            onClick={(e) => add(e.currentTarget)}
          >
            <PlusIcon />
          </button>
        ) : null}
      </article>
    </li>
  );
}
