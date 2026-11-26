"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/features/analytics/track";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import {
  createVisitMemory,
  fetchSuggestions,
  reasonText,
  selectCards,
  type Suggestion,
  type VisitMemory,
} from "./suggestions-logic";
import { CloseIcon, Plate, PlusIcon, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// "Goes well with" (ADR-077 data, ADR-080 screen; ADR-093 area pass). Loaded
// on the first dish added, never at first paint. One idea at a time, as one
// 64 px row inside the bottom panel right above the cart bar (no card, no
// shadow of its own): a 40 px plate, the name and price at 16 px, a 44 px «+»
// and a 44 px ×. On a phone it leaves by itself after 6 seconds or 200 px of
// scrolling, so it never sits over the menu; the next idea shows after one is
// added or declined. On a desktop it sits in the order rail under the total.
export type SuggestTrigger = {
  /** The dish just added. */
  id: string;
  /** Every dish in the cart then, the new one included. */
  cart: string[];
  /** A new add of the same dish is a new trigger object. */
  n: number;
};

// Answers by (dish, cart) for this page view, and the visit's memory.
const EMPTY: Suggestion[] = [];
const answers = new Map<string, Suggestion[]>();
let memory: { location: string; value: VisitMemory } | null = null;
const memoryFor = (location: string): VisitMemory => {
  if (memory?.location !== location) {
    let store: Storage | null = null;
    try {
      store = window.sessionStorage;
    } catch {}
    memory = { location, value: createVisitMemory(location, store) };
  }
  return memory.value;
};

export function Suggestions({
  locationId,
  trigger,
  cartIds,
  items,
  soldOut,
  track,
  onAdd,
  onChoose,
  autoHide = false,
}: {
  locationId: string;
  trigger: SuggestTrigger;
  /** What is in the cart now (changes as the guest orders more). */
  cartIds: string[];
  items: Record<string, GuestItem>;
  soldOut: string[];
  track: Track;
  /** One-tap add of a dish that needs no choice. */
  onAdd: (item: GuestItem, from: HTMLElement) => void;
  /** A dish with required choices opens its sheet instead. */
  onChoose: (item: GuestItem) => void;
  /** Leaves after 6 s or 200 px of scrolling (the phone's bottom panel). */
  autoHide?: boolean;
}) {
  const { t, locale } = useGuestI18n();
  // The answer belongs to the trigger it was fetched for, so a new add of the
  // same dish starts empty without resetting state in an effect.
  const [found, setFound] = useState<{ trigger: SuggestTrigger; list: Suggestion[] } | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => memoryFor(locationId).dismissed());
  const tracked = useRef(new Set<string>());
  const list = found?.trigger === trigger ? found.list : EMPTY;

  useEffect(() => {
    const mem = memoryFor(locationId);
    if (mem.wasTriggered(trigger.id)) return;
    const key = `${trigger.id}|${[...trigger.cart].sort().join(",")}`;
    const known = answers.get(key);
    if (known) {
      const timer = setTimeout(() => setFound({ trigger, list: known }), 0);
      return () => clearTimeout(timer);
    }
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 6_000);
    void fetchSuggestions(locationId, trigger.id, trigger.cart, abort.signal).then((result) => {
      clearTimeout(timeout);
      if (!result || abort.signal.aborted) return; // an error shows nothing and is tried again next time
      answers.set(key, result);
      mem.markTriggered(trigger.id);
      setFound({ trigger, list: result });
    });
    return () => {
      clearTimeout(timeout);
      abort.abort();
    };
  }, [locationId, trigger]);

  const cards = useMemo(
    () => selectCards(list, items, { triggerId: trigger.id, cartIds, soldOut, dismissed }),
    [list, items, trigger.id, cartIds, soldOut, dismissed],
  );

  // The phone's row goes away on its own: after 6 s, or once the guest scrolls on.
  const [gone, setGone] = useState<SuggestTrigger | null>(null);
  const shown = cards.length > 0 && gone !== trigger;
  useEffect(() => {
    if (!autoHide || !shown) return;
    const from = window.scrollY;
    const leave = () => setGone(trigger);
    const timer = setTimeout(leave, 6000);
    const onScroll = () => Math.abs(window.scrollY - from) > 200 && leave();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [autoHide, shown, trigger]);

  // Counted once per (dish, suggestion) for the visit, not each time it re-renders.
  useEffect(() => {
    const mem = memoryFor(locationId);
    // Only the one on screen counts as shown.
    for (const { item } of cards.slice(0, 1)) {
      const key = `${trigger.id}>${item.id}`;
      if (tracked.current.has(key) || mem.wasShown(trigger.id, item.id)) continue;
      tracked.current.add(key);
      mem.markShown(trigger.id, item.id);
      track("suggestion_shown", item.id, { from: trigger.id });
    }
  }, [cards, locationId, trigger.id, track]);

  if (!shown) return null;
  const dismiss = (id: string) => {
    memoryFor(locationId).dismiss(id);
    setDismissed((d) => new Set(d).add(id));
  };
  const { item, suggestion } = cards[0]!;
  const reason = reasonText(suggestion, items, trigger.id);
  const needsChoice = item.groups.some((g) => g.min > 0);
  return (
    <section aria-label={t("suggest.title")} data-testid="suggestions" className={`text-ink ${styles.suggest}`}>
      <h2 className="sr-only">{t("suggest.title")}</h2>
      <ul>
        <li key={item.id} data-testid="suggestion" data-dish={item.id} className="flex min-h-16 items-center gap-3">
          {item.image && <Plate src={dishPhotoUrl(item.image)} size={40} className="size-10 flex-none" />}
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-muted text-meta" data-testid="suggestion-reason">
              {t(reason.key, reason.vars)}
            </span>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-body">
              <Txt value={item.name} locale={locale} className="min-w-0 font-semibold break-words" />
              <span className="num text-accent-text flex-none font-semibold">{formatAmd(item.price, locale)}</span>
            </span>
          </span>
          <button
            type="button"
            data-testid="suggestion-add"
            aria-label={t("menu.add", { name: item.name.text })}
            aria-haspopup={needsChoice ? "dialog" : undefined}
            onClick={(e) => {
              if (needsChoice) return onChoose(item);
              track("suggestion_accepted", item.id, { from: trigger.id });
              onAdd(item, e.currentTarget);
            }}
            className="bg-add text-on-add grid size-11 flex-none place-items-center rounded-full [&_svg]:size-[18px]"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            data-testid="suggestion-dismiss"
            aria-label={t("suggest.dismiss", { name: item.name.text })}
            title={t("suggest.noThanks")}
            onClick={() => dismiss(item.id)}
            className="text-muted hover:bg-chip hover:text-ink grid size-11 flex-none place-items-center rounded-full [&_svg]:size-[18px]"
          >
            <CloseIcon />
          </button>
        </li>
      </ul>
    </section>
  );
}
