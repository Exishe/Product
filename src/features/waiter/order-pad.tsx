"use client";

import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Check, Minus, Plus, Search, Send, X } from "lucide-react";
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

  return (
    <Sheet labelledBy={titleId} onClose={onClose} wide>
      <div className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_20rem] md:grid-rows-[auto_minmax(0,1fr)]">
        <header className="border-staff-sep flex items-center justify-between gap-3 border-b bg-white px-4 py-2 sm:px-6 md:col-span-2">
          <h2
            id={titleId}
            className="m-0 min-w-0 text-[1.25rem] leading-tight font-bold [overflow-wrap:anywhere]"
          >
            {t("title", { label })}
          </h2>
          <button type="button" className={button("secondary", "rounded-full")} onClick={onClose}>
            <X aria-hidden="true" />
            {t("close")}
          </button>
        </header>

        {categories.length === 0 ? (
          <p className="text-staff-label2 m-0 p-6">{t("noMenu")}</p>
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
          <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden p-4">
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
            <div
              role="group"
              aria-label={t("categories")}
              className={clsx("flex gap-2 overflow-x-auto", q && "invisible")}
            >
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className="text-staff-label2 ring-staff-sep aria-pressed:bg-ink aria-pressed:ring-ink min-h-12 flex-none rounded-full bg-white px-4 font-semibold ring-1 aria-pressed:text-white"
                  lang={c.name ? nameLang(c.name.lang) : undefined}
                >
                  {c.name?.text}
                </button>
              ))}
            </div>
            <ul className="m-0 grid list-none content-start gap-2 overflow-y-auto p-0 sm:grid-cols-2">
              {shown.length === 0 && <li className="text-staff-label2">{t("empty")}</li>}
              {shown.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="pad-item"
                    disabled={item.soldOut}
                    onClick={() => tap(item)}
                    className="disabled:bg-staff-fill disabled:text-staff-label2 flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-2 text-left text-[1.0625rem]"
                  >
                    {/* The name comes from what the button shows (axe: label-content-name-mismatch). */}
                    <span className="min-w-0 font-semibold break-words">
                      {t.rich("addItem", {
                        name: item.name.text,
                        hidden: (chunks) => <span className="sr-only">{chunks}</span>,
                        dish: (chunks) => <span lang={nameLang(item.name.lang)}>{chunks}</span>,
                      })}
                    </span>
                    <span className="flex flex-none items-center gap-2">
                      <span className="num text-[0.9375rem]">
                        {item.soldOut ? t("soldOut") : formatAmd(item.price, locale)}
                      </span>
                      {!item.soldOut && <Plus aria-hidden="true" className="text-ink size-5" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <aside
          aria-label={t("cart")}
          className="border-staff-sep grid min-h-0 grid-rows-[minmax(0,1fr)_auto] border-t bg-white md:border-t-0 md:border-l"
        >
          <ul
            data-testid="pad-cart"
            className="m-0 grid max-h-[30dvh] list-none content-start gap-2 overflow-y-auto p-4 md:max-h-none"
          >
            {cart.length === 0 && <li className="text-staff-label2">{t("cartEmpty")}</li>}
            {cart.map((l) => (
              <li key={l.key} className="grid gap-1">
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
                    className={button("secondary", "w-12 px-0")}
                    onClick={() => step(l.key, -1)}
                  >
                    <Minus aria-hidden="true" />
                  </button>
                  <span className="num w-8 text-center text-xl font-bold">{l.quantity}</span>
                  <button
                    type="button"
                    aria-label={t("more", { name: l.item.name.text })}
                    className={button("secondary", "w-12 px-0")}
                    onClick={() => step(l.key, 1)}
                  >
                    <Plus aria-hidden="true" />
                  </button>
                  <span className="num ml-auto">{formatAmd(l.unit * l.quantity, locale)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="border-staff-sep grid gap-3 border-t p-4">
            <label className="text-staff-label2 grid gap-1 text-[0.8125rem] font-semibold">
              {t("note")}
              <textarea
                value={note}
                maxLength={300}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                className="bg-staff-fill text-ink rounded-xl px-3 py-2 text-[1.0625rem] font-normal"
              />
            </label>
            <div className="flex justify-end text-[1.375rem] font-bold">
              <span className="num">{formatAmd(total, locale)}</span>
            </div>
            <button
              type="button"
              className={button("primary", "min-h-14")}
              disabled={cart.length === 0}
              onClick={send}
            >
              <Send aria-hidden="true" />
              {t("send")}
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
    <div className="grid min-h-0 content-start gap-4 overflow-y-auto p-6">
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
