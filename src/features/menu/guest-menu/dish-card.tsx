"use client";

import { useRef, useState, type CSSProperties } from "react";
import motionStyles from "@/features/guest-theme/motion/motion.module.css";
import { useReveal } from "@/features/guest-theme/motion/reveal";
import { useTilt } from "@/features/guest-theme/motion/tilt";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { MAX_QUANTITY } from "@/features/ordering/cart";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { PlusIcon, Plate, Stepper, TagChip, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// One dish as a card (owner's pick, menu-layout.webp): the dish on a round
// plate, its name in the display face, the price, portion and tags, and a
// round "+" hanging off the card's corner. The whole card opens the dish
// sheet (a stretched button); "+" adds a simple dish at once, or opens the
// sheet when there's a choice to make. Cards rise
// in as they come into view and tilt towards the pointer or finger, with a
// glare and a turn of the plate (Tilted Card). The first few (`index`) rise
// at first paint in CSS; any card below the fold waits for it (reveal.ts).
//
// A featured dish (popular, with a photo) is the owner's template's expanded
// card: two columns wide from 360 px, the photo bleeding off its top-right
// corner with the text flowing round it, chips, the description, a larger
// price, a − n + stepper and a filled "Add". In Pure (ADR-056, CSS only) a
// plain card adds with a quiet "+ Add" under its price instead of the round
// corner button, and the portion is a chip. Long names wrap between words
// and hyphenate (the text's lang is set), breaking inside a word only when
// it can't fit at all.
const ENTER_FIRST = 6;
const WRAP = "break-words hyphens-auto";

export function DishCard({
  item,
  canOrder,
  featured = false,
  priority = false,
  index = ENTER_FIRST,
  warning,
  onOpen,
  onQuickAdd,
}: {
  item: GuestItem;
  canOrder: boolean;
  /** What the guest's allergy filter says about this dish, if anything. */
  warning?: { text: string; strong: boolean } | null;
  featured?: boolean;
  /** The page's first featured photo: fetched at high priority. */
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
  const addLabel = t("menu.add", { name: item.name.text });
  const add = (from: HTMLElement) => {
    if (needsChoice) return onOpen(item);
    onQuickAdd(item, from, quantity);
    setQuantity(1);
  };
  const stepLabels = {
    decrease: t("sheet.decrease"),
    increase: t("sheet.increase"),
    quantity: t("sheet.quantity"),
  };
  // A plain card's is a round "+" on its corner, or "+ Add" under the
  // price in Pure (guest.module.css); the featured card's is a filled pill.
  const addButton = (className?: string) => (
    <button
      type="button"
      className={className}
      aria-label={addLabel}
      aria-haspopup={needsChoice ? "dialog" : undefined}
      onClick={(e) => add(e.currentTarget)}
    >
      <PlusIcon />
      <span className={styles.addWord}>{t("sheet.add")}</span>
    </button>
  );

  const facts = (
    <span
      className={`text-muted flex flex-wrap items-center gap-1.5 text-meta ${featured ? "" : "justify-center"}`}
    >
      {item.soldOut && <span className="text-alert font-semibold">{t("menu.soldOut")}</span>}
      {item.substitution && (
        <span className="basis-full font-semibold">
          {t("menu.withSub", { to: item.substitution.to })}
        </span>
      )}
      {item.portion && (
        <span className={styles.portion}>
          {t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}
        </span>
      )}
      {item.tags.map((tag) => (
        <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
      ))}
      {warning && (
        <span className={`basis-full font-semibold ${warning.strong ? "text-alert" : "text-muted"}`}>
          {warning.text}
        </span>
      )}
    </span>
  );
  const price = (
    <span
      className={`num text-accent-text font-semibold whitespace-nowrap ${featured ? "text-[1.625rem]" : "text-name"} ${muted}`}
    >
      {formatAmd(item.price, locale)}
    </span>
  );

  const featuredBody = (
    <>
      <Plate
        src={photo}
        size={360}
        priority={priority}
        muted={item.soldOut}
        className={`pointer-events-none absolute ${styles.featurePlate} ${motionStyles.spin}`}
      />
      {/* The plate's footprint: the text flows round it, then under it. */}
      <span aria-hidden="true" className={styles.featureGap} />
      <Txt
        value={item.name}
        locale={locale}
        className={`display-face block ${styles.featureName} ${WRAP} ${muted}`}
      />
      <span className="mt-3 block">{facts}</span>
      {item.description && (
        <Txt
          value={item.description}
          locale={locale}
          className={`text-muted ${styles.featureText} ${WRAP}`}
        />
      )}
      <span className="mt-4 block">{price}</span>
    </>
  );

  return (
    <li
      ref={row}
      className={`${featured ? "col-span-full min-[360px]:col-span-2" : "min-w-0"} ${motionStyles.reveal} ${early ? motionStyles.enter : ""}`}
      style={early ? ({ "--i": index } as CSSProperties) : undefined}
      data-testid="dish"
      data-dish-id={item.id}
      data-featured={featured || undefined}
      data-warning={warning ? (warning.strong ? "contains" : "unknown") : undefined}
    >
      <article
        ref={card}
        className={`group bg-surface text-ink shadow-card relative isolate h-full border [border-color:var(--guest-card-border)] ${
          featured ? "rounded-feature overflow-clip" : "rounded-card"
        } ${featured ? `flex flex-col ${styles.feature}` : ""}`}
      >
        <button
          type="button"
          disabled={item.soldOut}
          onClick={() => onOpen(item)}
          className={`w-full rounded-[inherit] disabled:cursor-default ${
            featured
              ? `flow-root flex-1 text-left ${styles.featurePad}`
              : `block h-full px-3 pt-4 pb-7 text-center sm:px-4 ${styles.cardBody}`
          }`}
        >
          {featured ? (
            featuredBody
          ) : (
            <>
              <Plate
                src={photo}
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
              {(item.portion || item.tags.length > 0 || item.soldOut || item.substitution || warning) && (
                <span className="mt-1.5 block">{facts}</span>
              )}
            </>
          )}
        </button>
        <span aria-hidden="true" className={motionStyles.glare} />
        {showAdd && featured ? (
          <div className={styles.featureActions}>
            {!needsChoice && (
              <span role="group" aria-label={item.name.text} className={styles.stepper}>
                <Stepper
                  value={quantity}
                  max={MAX_QUANTITY}
                  onChange={setQuantity}
                  labels={stepLabels}
                  button="size-11"
                />
              </span>
            )}
            {addButton(styles.featureAdd)}
          </div>
        ) : showAdd ? (
          addButton(styles.add)
        ) : null}
      </article>
    </li>
  );
}
