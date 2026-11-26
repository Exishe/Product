"use client";

import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronUp, Minus, Plus, Search, Send, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { GuestCategory, GuestItem } from "@/features/menu/guest-menu/view-model";
import {
  initialSelection,
  isSelectionValid,
  selectedIds,
  toggleOption,
  unitPrice,
  type Selection,
} from "@/features/menu/guest-menu/selection";
import type { Locale } from "@/i18n/routing";
import { formatAmd } from "@/lib/format/money";
import { normalizeForSearch } from "@/lib/format/search";
import type { PadLine, WaiterAction } from "./floor-model";
import { button, choice, Sheet } from "./ui";

type CartLine = {
  key: string;
  item: GuestItem;
  modifierIds: string[];
  optionNames: string[];
  unit: number;
  quantity: number;
};

export type PadOrder = Pick<Extract<WaiterAction, { kind: "place" }>, "lines" | "note" | "preview">;

// ± on a cart line: 44 px, an ink ring on white, so it reads as a button.
const STEPPER =
  "text-ink grid size-11 shrink-0 place-items-center rounded-full bg-white ring-[1.5px] ring-ink ring-inset";
// The count between − and +: one filled ink circle in the menu row and in the cart.
const COUNT =
  "num bg-ink grid h-11 min-w-11 shrink-0 place-items-center rounded-full px-2 text-[1.125rem] font-bold text-white";

// The order pad (screens.md §6): the guest's menu, compact, with search and
// big touch targets. Sending goes through the outbox, so it works offline.
export function OrderPad({
  label,
  categories,
  onClose,
  onSend,
}: {
  label: string;
  categories: readonly GuestCategory[];
  onClose: () => void;
  onSend: (order: PadOrder) => void;
}) {
  const t = useTranslations("waiter.pad");
  const locale = useLocale() as Locale;
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(categories[0]?.id ?? null);
  const [choosing, setChoosing] = useState<{ item: GuestItem; selection: Selection } | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const cartId = useId();

  const q = normalizeForSearch(query);
  const shown = useMemo(() => {
    if (q)
      return categories
        .flatMap((c) => c.items)
        .filter((i) => i.search.split("\n").some((s) => s.includes(q)));
    return categories.find((c) => c.id === category)?.items ?? [];
  }, [categories, category, q]);

  const add = (item: GuestItem, selection: Selection) => {
    const ids = selectedIds(item.groups, selection);
    const key = [item.id, ...[...ids].sort()].join("|");
    const optionNames = item.groups.flatMap((g) =>
      g.modifiers.filter((m) => ids.includes(m.id)).map((m) => m.name.text),
    );
    setCart((list) => {
      const found = list.find((l) => l.key === key);
      if (found)
        return list.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + 1) } : l));
      return [
        ...list,
        {
          key,
          item,
          modifierIds: ids,
          optionNames,
          unit: unitPrice(item.price, item.groups, selection),
          quantity: 1,
        },
      ];
    });
  };

  const tap = (item: GuestItem) => {
    if (item.soldOut) return;
    if (item.groups.length > 0) setChoosing({ item, selection: initialSelection(item.groups) });
    else add(item, {});
  };

  const step = (key: string, delta: number) =>
    setCart((list) =>
      list.flatMap((l) =>
        l.key !== key
          ? [l]
          : l.quantity + delta <= 0
            ? []
            : [{ ...l, quantity: Math.min(20, l.quantity + delta) }],
      ),
    );

  // How many of each dish are in the order, whatever the options.
  const picked = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.item.id, (m.get(l.item.id) ?? 0) + l.quantity);
    return m;
  }, [cart]);
  // ± on a menu row works on the dish's last line in the order.
  const stepItem = (itemId: string, delta: number) => {
    const last = cart.findLast((l) => l.item.id === itemId);
    if (last) step(last.key, delta);
  };

  const total = cart.reduce((s, l) => s + l.unit * l.quantity, 0);

  const send = () => {
    const lines: PadLine[] = cart.map((l) => ({
      item_id: l.item.id,
      quantity: l.quantity,
      modifier_ids: l.modifierIds,
      note: null,
    }));
    onSend({
      lines,
      note: note.trim() || null,
      preview: {
        lines: cart.map((l) => ({
          name: { text: l.item.name.text, locale: l.item.name.lang },
          quantity: l.quantity,
          lineTotal: l.unit * l.quantity,
        })),
        total,
      },
    });
  };

  const nameLang = (lang: Locale) => (lang !== locale ? lang : undefined);
  const count = cart.reduce((s, l) => s + l.quantity, 0);
  const tw = useTranslations("waiter");

  return (
    <Sheet labelledBy={titleId} onClose={onClose} wide>
      {/* One fixed height from the first frame: the pad never grows when the
          order bar appears under the menu. */}
      <div className="grid h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] bg-white max-sm:h-[calc(92dvh-env(safe-area-inset-bottom,0px))] md:h-[min(92dvh,50rem)] md:grid-cols-[minmax(0,1fr)_20rem] md:grid-rows-[auto_minmax(0,1fr)]">
        <header className="border-staff-sep flex items-center justify-between gap-3 border-b px-4 py-2 sm:px-6 md:col-span-2">
          {/* «Նոր պատվեր» as a small line over the table: the title never wraps.
              Screen readers hear the one sentence. */}
          <h2 id={titleId} className="m-0 grid min-w-0 leading-tight">
            <span aria-hidden="true" className="text-staff-label2 text-[0.9375rem] font-semibold">
              {t("overline")}
            </span>
            <span aria-hidden="true" className="truncate text-[1.375rem] font-bold">
              {tw("panel.table", { label })}
            </span>
            <span className="sr-only">{t("title", { label })}</span>
          </h2>
          <button
            type="button"
            aria-label={t("close")}
            title={t("close")}
            className="bg-staff-fill text-ink grid size-11 shrink-0 place-items-center rounded-full"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        {categories.length === 0 ? (
          <p className="text-staff-label2 m-0 p-6 md:col-start-1 md:row-start-2">{t("noMenu")}</p>
        ) : choosing ? (
          <Options
            item={choosing.item}
            selection={choosing.selection}
            onChange={(selection) => setChoosing({ ...choosing, selection })}
            onCancel={() => setChoosing(null)}
            onAdd={() => {
              add(choosing.item, choosing.selection);
              setChoosing(null);
            }}
          />
        ) : (
          // The menu is what the waiter works in: the wide column from
          // 768 px, placed explicitly (an item locked to a row is placed
          // first, so without this the cart took the left column).
          <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden px-4 pt-3 sm:px-6 md:col-start-1 md:row-start-2">
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="text-staff-label2 pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2"
              />
              <input
                type="search"
                aria-label={t("search")}
                placeholder={t("search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-staff-fill placeholder:text-staff-label2 min-h-12 w-full rounded-xl pr-4 pl-10 text-[1.0625rem]"
              />
            </span>
            {/* The row fades at its right edge, so a cut chip reads as "more this way". */}
            <div
              role="group"
              aria-label={t("categories")}
              className={clsx(
                "-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6",
                "[mask-image:linear-gradient(to_right,#000_85%,transparent)]",
                q && "invisible",
              )}
            >
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className="text-staff-label2 ring-staff-sep aria-pressed:bg-ink aria-pressed:ring-ink min-h-11 flex-none rounded-full bg-white px-4 text-[0.9375rem] font-semibold whitespace-nowrap ring-1 ring-inset aria-pressed:text-white"
                  lang={c.name ? nameLang(c.name.lang) : undefined}
                >
                  {c.name?.text}
                </button>
              ))}
            </div>
            {/* The dishes as 64 px rows on the one white surface, split by hairlines. */}
            <ul className="border-staff-sep m-0 grid list-none content-start overflow-y-auto border-t p-0 pb-4">
              {shown.length === 0 && <li className="text-staff-label2 py-4">{t("empty")}</li>}
              {shown.map((item) => {
                const inCart = picked.get(item.id) ?? 0;
                return (
                <li key={item.id} className="border-staff-sep flex items-center gap-2 border-b">
                  <button
                    type="button"
                    data-testid="pad-item"
                    data-count={inCart || undefined}
                    disabled={item.soldOut}
                    onClick={() => tap(item)}
                    className="disabled:text-staff-label2 flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left text-[1.0625rem]"
                  >
                    {/* The name comes from what the button shows (axe: label-content-name-mismatch). */}
                    <span className="min-w-0 font-semibold break-words">
                      {t.rich("addItem", {
                        name: item.name.text,
                        hidden: (chunks) => <span className="sr-only">{chunks}</span>,
                        dish: (chunks) => <span lang={nameLang(item.name.lang)}>{chunks}</span>,
                      })}
                      {inCart > 0 && (
                        <span aria-hidden="true" className="num text-staff-label2 block text-[0.9375rem] font-normal">
                          {formatAmd(item.price, locale)}
                        </span>
                      )}
                    </span>
                    {/* With the stepper beside it the price moves under the
                        name, so the name keeps the room on a 360 px phone. */}
                    <span
                      className={clsx(
                        "flex flex-none items-center gap-3",
                        inCart > 0 && "sr-only",
                      )}
                    >
                      <span className="num text-[1.0625rem]">
                        {item.soldOut ? t("soldOut") : formatAmd(item.price, locale)}
                      </span>
                      {!item.soldOut && inCart === 0 && (
                        <span
                          aria-hidden="true"
                          className="text-ink ring-ink grid size-11 place-items-center rounded-full ring-[1.5px] ring-inset"
                        >
                          <Plus className="size-5" />
                        </span>
                      )}
                    </span>
                  </button>
                  {/* Once it is in the order the + becomes − N +, as on
                      iikoWaiter: the row itself shows how many, no summary
                      needed. A dish with options opens them again on +, and −
                      takes off the last one added. From 768 px the cart column
                      beside the menu holds the one stepper: the row keeps its
                      + and a small count, so a dish never has two. */}
                  {inCart > 0 && (
                    <span data-testid="pad-row-stepper" className="flex flex-none items-center gap-1 md:gap-2">
                      <button
                        type="button"
                        aria-label={t("rowLess", { name: item.name.text })}
                        className={clsx(STEPPER, "md:hidden")}
                        onClick={() => stepItem(item.id, -1)}
                      >
                        <Minus aria-hidden="true" className="size-5" />
                      </button>
                      <span data-testid="pad-row-count" className={clsx(COUNT, "md:h-8 md:min-w-8 md:text-[1rem]")}>
                        {inCart}
                      </span>
                      <button
                        type="button"
                        aria-label={t("rowMore", { name: item.name.text })}
                        className={STEPPER}
                        onClick={() => (item.groups.length > 0 ? tap(item) : stepItem(item.id, 1))}
                      >
                        <Plus aria-hidden="true" className="size-5" />
                      </button>
                    </span>
                  )}
                </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* The order so far. On a phone it folds into one 56 px bar
            («2 ուտեստ · 4 400 ֏») that opens on a tap, and is not there at all
            while nothing is picked, so the menu keeps the screen. From 768 px
            it is a column beside the menu. The total sits in the send button. */}
        <aside
          aria-label={t("cart")}
          className={clsx(
            // Its own rows: a heading (the summary bar on a phone), the
            // scrolling list, and the note and send button at the foot. No
            // track stretches the button.
            "border-staff-sep grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-t md:col-start-2 md:row-start-2 md:border-t-0 md:border-l",
            cart.length === 0 && "max-md:hidden",
          )}
        >
          <button
            type="button"
            data-testid="pad-summary"
            aria-expanded={cartOpen}
            aria-controls={cartId}
            onClick={() => setCartOpen((v) => !v)}
            className="flex min-h-14 items-center justify-between gap-3 px-4 text-left text-[1.0625rem] font-semibold sm:px-6 md:hidden"
          >
            <span className="num">
              {t("items", { count })} · {formatAmd(total, locale)}
            </span>
            <ChevronUp
              aria-hidden="true"
              className={clsx("size-5 shrink-0 transition-transform duration-200", cartOpen && "rotate-180")}
            />
          </button>
          <p className="num m-0 flex min-h-12 items-center justify-between gap-3 px-4 pt-2 text-[1.0625rem] font-semibold max-md:hidden">
            <span>{t("cart")}</span>
            {count > 0 && <span className="text-staff-label2 text-[0.9375rem]">{t("items", { count })}</span>}
          </p>
          <ul
            id={cartId}
            data-testid="pad-cart"
            className={clsx(
              "m-0 grid max-h-[40dvh] min-h-0 list-none content-start overflow-y-auto px-4 sm:px-6 md:max-h-none md:px-4",
              !cartOpen && "max-md:hidden",
            )}
          >
            {cart.length === 0 && <li className="text-staff-label2 py-2">{t("cartEmpty")}</li>}
            {cart.map((l) => (
              <li key={l.key} className="border-staff-sep grid gap-1 border-b py-3 last:border-b-0">
                <span className="font-semibold break-words" lang={nameLang(l.item.name.lang)}>
                  {l.item.name.text}
                </span>
                {l.optionNames.length > 0 && (
                  <span className="text-staff-label2 text-[0.9375rem]">{l.optionNames.join(", ")}</span>
                )}
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t("less", { name: l.item.name.text })}
                    className={STEPPER}
                    onClick={() => step(l.key, -1)}
                  >
                    <Minus aria-hidden="true" className="size-5" />
                  </button>
                  <span className={COUNT}>{l.quantity}</span>
                  <button
                    type="button"
                    aria-label={t("more", { name: l.item.name.text })}
                    className={STEPPER}
                    onClick={() => step(l.key, 1)}
                  >
                    <Plus aria-hidden="true" className="size-5" />
                  </button>
                  <span className="num ml-auto">{formatAmd(l.unit * l.quantity, locale)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="border-staff-sep grid content-end gap-2 self-end border-t px-4 pt-2 pb-4 sm:px-6 md:px-4">
            {noteOpen || note ? (
              <label className="text-staff-label2 grid gap-1 text-[0.9375rem] font-semibold">
                {t("note")}
                <textarea
                  value={note}
                  maxLength={300}
                  rows={2}
                  autoFocus={noteOpen && !note}
                  onChange={(e) => setNote(e.target.value)}
                  className="bg-staff-fill text-ink rounded-xl px-3 py-2 text-[1.0625rem] font-normal"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="text-ink -ml-2 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-xl px-2 text-[0.9375rem] font-semibold"
              >
                <Plus aria-hidden="true" className="size-4 shrink-0" />
                {t("note")}
              </button>
            )}
            <button
              type="button"
              className={button("primary", "h-14 self-end md:flex-wrap md:content-center md:gap-y-0 md:px-4")}
              disabled={cart.length === 0}
              onClick={send}
            >
              {/* In the 20 rem cart column the icon gives way and the words
                  and the total wrap as two whole lines, never mid-label. */}
              <Send aria-hidden="true" className="md:hidden" />
              <span className="whitespace-nowrap">{t("send")}</span>
              {cart.length > 0 && (
                <span className="num font-bold whitespace-nowrap">
                  <span aria-hidden="true">· </span>
                  {formatAmd(total, locale)}
                </span>
              )}
            </button>
          </div>
        </aside>
      </div>
    </Sheet>
  );
}

function Options({
  item,
  selection,
  onChange,
  onCancel,
  onAdd,
}: {
  item: GuestItem;
  selection: Selection;
  onChange: (s: Selection) => void;
  onCancel: () => void;
  onAdd: () => void;
}) {
  const t = useTranslations("waiter.pad");
  const locale = useLocale() as Locale;
  return (
    <div className="grid min-h-0 content-start gap-4 overflow-y-auto p-6 md:col-start-1 md:row-start-2">
      <h3 className="m-0 text-[1.25rem] font-bold break-words">{item.name.text}</h3>
      {item.groups.map((g) => (
        <fieldset key={g.id} className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-2 font-semibold">
            {g.name?.text ?? t("options")}
            {g.min > 0 && (
              <span className="text-staff-label2 ml-2 text-[0.8125rem] font-normal">{t("required")}</span>
            )}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.modifiers.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={selection[g.id]?.includes(m.id) ?? false}
                onClick={() => onChange(toggleOption(selection, g, m.id))}
                className={choice}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {(selection[g.id]?.includes(m.id) ?? false) && <Check aria-hidden="true" />}
                  {m.name.text}
                </span>
                {m.delta > 0 && <span className="num">+{formatAmd(m.delta, locale)}</span>}
                {m.delta < 0 && <span className="num">−{formatAmd(-m.delta, locale)}</span>}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={button("secondary")} onClick={onCancel}>
          {t("close")}
        </button>
        <button
          type="button"
          className={button("primary")}
          disabled={!isSelectionValid(item.groups, selection)}
          onClick={onAdd}
        >
          {t("addWithOptions")}
        </button>
      </div>
    </div>
  );
}
