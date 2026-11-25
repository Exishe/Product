"use client";

import { useEffect, useRef } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import type { SubInfo } from "@/features/ordering/substitutions-parse";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";

/** One dish to ask about; `price` is the dish's price once the replacement applies (null when unknown). */
export type SubAsk = { sub: SubInfo; name: string; price: number | null };

// "Today this dish is made with X instead of Y. OK?" (ADR-076). Shown when a
// dish with a replaced ingredient is added, and again when an order is
// refused with substitution_changed. The guest's answer is final and nothing
// here says that anything ran out. A native <dialog> gives the focus trap,
// Escape and the inert page behind it; Escape and the second button both mean
// "no". Loaded only when first needed.
export function SubsDialog({
  entries,
  mode,
  onAccept,
  onDecline,
}: {
  entries: SubAsk[];
  /** "add": a dish is being added; "send": dishes already in the order. */
  mode: "add" | "send";
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t, locale } = useGuestI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const answered = useRef(false);
  const answer = (yes: boolean) => {
    if (answered.current) return;
    answered.current = true;
    if (dialog.current?.open) dialog.current.close();
    (yes ? onAccept : onDecline)();
  };

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
      if (d.open) d.close();
    };
  }, []);

  const one = entries.length === 1 ? entries[0] : undefined;
  const priceLine = (e: SubAsk) =>
    e.sub.delta !== 0 && e.price !== null ? t("subs.newPrice", { price: formatAmd(e.price, locale) }) : null;
  const button = "min-h-12 w-full px-6 font-semibold";
  return (
    <dialog
      ref={dialog}
      aria-labelledby="subs-title"
      aria-describedby="subs-body"
      data-testid="subs-dialog"
      onCancel={(e) => {
        e.preventDefault(); // Escape: the same as "no"
        answer(false);
      }}
      className="rounded-feature bg-surface text-ink shadow-float m-auto w-[calc(100%-2rem)] max-w-[28rem] border-0 p-0 backdrop:bg-black/55"
    >
      <div className="grid gap-4 px-6 py-7">
        <h2 id="subs-title" className="display-face text-[1.5rem] leading-tight break-words">
          {one ? one.name : t("subs.titleMany")}
        </h2>
        <div id="subs-body" className="grid gap-3">
          {one ? (
            <>
              <p>{t("subs.one", { to: one.sub.to, from: one.sub.from })}</p>
              {priceLine(one) && <p className="num font-semibold">{priceLine(one)}</p>}
            </>
          ) : (
            <>
              <p>{t("subs.many")}</p>
              <ul className="grid list-none gap-2 p-0">
                {entries.map((e) => (
                  <li key={e.sub.itemId}>
                    <span className="block font-semibold break-words">{e.name}</span>
                    <span className="block">{t("subs.item", { to: e.sub.to, from: e.sub.from })}</span>
                    {priceLine(e) && <span className="num block font-semibold">{priceLine(e)}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="grid gap-2">
          <button
            type="button"
            autoFocus
            data-testid="subs-accept"
            className={`${styles.cta} ${button}`}
            onClick={() => answer(true)}
          >
            {t("subs.order")}
          </button>
          <button
            type="button"
            data-testid="subs-decline"
            className={`rounded-pill border-line-strong bg-surface border ${button}`}
            onClick={() => answer(false)}
          >
            {mode === "add" ? t("subs.other") : t(entries.length > 1 ? "subs.removeMany" : "subs.removeOne")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
