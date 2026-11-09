"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addLine, cartSummary, setQuantity, type CartMenu } from "@/features/ordering/cart";
import { cartKey, useCart } from "@/features/ordering/cart-store";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { normalizeForSearch } from "@/lib/format/search";
import { CartView } from "./cart-view";
import { CategoryNav, sectionId } from "./category-nav";
import { DishRow } from "./dish-row";
import { DishSheet } from "./dish-sheet";
import styles from "./guest.module.css";
import { initialSelection, selectedIds } from "./selection";
import { Notice, Txt } from "./ui";
import type { GuestItem, GuestMenuData } from "./view-model";

export type TableState = { kind: "ok"; id: string; label: string; token: string } | { kind: "none" } | { kind: "invalid" };

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const CART_HASH = "#cart";

export function GuestMenu({
  menu,
  table,
  renderSend,
}: {
  menu: GuestMenuData;
  table: TableState;
  /** The send area of the cart (Task 5.1); without it the cart is a list to show the waiter. */
  renderSend?: (args: { lines: ReturnType<typeof cartSummary>; clear: () => void; setLocked: (locked: boolean) => void }) => ReactNode;
}) {
  const { t, locale } = useGuestI18n();
  const tableId = table.kind === "ok" ? table.id : null;
  const [lines, updateCart] = useCart(cartKey(menu.locationId, tableId));
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<GuestItem | null>(null);
  const [view, setView] = useState<"menu" | "cart">("menu");
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [locked, setLocked] = useState(false);
  const menuScroll = useRef(0);
  const canOrder = menu.ordering && table.kind === "ok";

  const items = useMemo(() => Object.fromEntries(menu.categories.flatMap((c) => c.items.map((i) => [i.id, i]))), [menu]);
  const cartMenu: CartMenu = useMemo(
    () =>
      Object.fromEntries(
        Object.values(items).map((i) => [
          i.id,
          { price: i.price, soldOut: i.soldOut, groups: i.groups.map((g) => ({ ...g, modifiers: g.modifiers.map((m) => ({ id: m.id, delta: m.delta })) })) },
        ]),
      ),
    [items],
  );
  const summary = useMemo(() => cartSummary(lines, cartMenu), [lines, cartMenu]);

  const q = normalizeForSearch(query);
  const shown = useMemo(
    () => (q ? menu.categories.map((c) => ({ ...c, items: c.items.filter((i) => i.search.includes(q)) })).filter((c) => c.items.length) : menu.categories),
    [menu.categories, q],
  );

  // The cart is a view of this page with its own history entry, so the
  // phone's back button returns to the menu.
  useEffect(() => {
    const sync = () => setView(window.location.hash === CART_HASH ? "cart" : "menu");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const openCart = () => {
    menuScroll.current = window.scrollY;
    window.history.pushState(null, "", CART_HASH);
    setView("cart");
    window.scrollTo(0, 0);
  };
  const closeCart = useCallback(() => {
    if (window.location.hash === CART_HASH) window.history.back();
    else setView("menu");
  }, []);

  const wasCart = useRef(false);
  useEffect(() => {
    if (view === "menu" && wasCart.current) window.scrollTo(0, menuScroll.current);
    wasCart.current = view === "cart";
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const add = (item: GuestItem, add: { modifierIds: string[]; quantity: number; note: string }) => {
    updateCart((current) => addLine(current, { itemId: item.id, ...add }, newId));
    setToast({ key: Date.now(), text: t("menu.added", { name: item.name.text }) });
  };
  const quickAdd = (item: GuestItem) =>
    add(item, { modifierIds: selectedIds(item.groups, initialSelection(item.groups)), quantity: 1, note: "" });

  const orderingNotice =
    table.kind === "invalid" ? (
      <Notice tone="alert">{t("menu.badTable")}</Notice>
    ) : !menu.ordering ? (
      <Notice tone="calm">{t("menu.orderingOff")}</Notice>
    ) : table.kind === "none" ? (
      <Notice tone="calm">{t("menu.noTable")}</Notice>
    ) : null;

  if (view === "cart" && lines.length > 0) {
    return (
      <CartView
        summary={summary}
        items={items}
        locked={locked}
        notice={orderingNotice ?? (summary.blocked ? <Notice tone="alert">{t("cart.soldOut")}</Notice> : null)}
        footer={canOrder && renderSend ? renderSend({ lines: summary, clear: () => updateCart(() => []), setLocked }) : null}
        onQuantity={(id, quantity) => {
          const next = setQuantity(lines, id, quantity);
          updateCart(() => next);
          if (next.length === 0) closeCart(); // removing the last line returns to the menu (screens.md)
        }}
        onBack={closeCart}
      />
    );
  }

  return (
    <>
      {(orderingNotice || menu.kitchenBusy) && (
        <div className="grid gap-2 px-4 pb-3">
          {orderingNotice}
          {menu.kitchenBusy && canOrder && (
            <Notice tone="busy">
              {menu.kitchenBusy.minutes ? t("menu.kitchenBusy", { minutes: menu.kitchenBusy.minutes }) : t("menu.kitchenBusyNoTime")}
            </Notice>
          )}
        </div>
      )}
      <div className="px-4 pb-3">
        <label className="sr-only" htmlFor="menu-search">
          {t("menu.search")}
        </label>
        <input
          id="menu-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("menu.search")}
          autoComplete="off"
          enterKeyHint="search"
          className="min-h-12 w-full rounded-input border border-line-strong bg-white px-4 placeholder:text-muted"
        />
      </div>
      <CategoryNav categories={shown} />
      <main className="flex-1 px-4 pb-8">
        {shown.length === 0 ? (
          <p className="py-12 text-center text-muted" role="status">
            {t("menu.noResults")}
          </p>
        ) : (
          shown.map((c) => (
            <section key={c.id} id={sectionId(c.id)} aria-labelledby={`h-${c.id}`} className="scroll-mt-20 pt-6">
              {c.name && <Txt as="h2" id={`h-${c.id}`} value={c.name} locale={locale} className="display-face mb-2 text-3xl text-tarragon" />}
              <ul>
                {c.items.map((item) => (
                  <DishRow key={item.id} item={item} canOrder={canOrder} onOpen={setSheet} onQuickAdd={quickAdd} />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
      {lines.length > 0 && (
        <div className="sticky bottom-0 z-10 bg-linear-to-t from-matsoni from-70% to-transparent px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={openCart}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-sheet bg-apricot px-4 text-left font-semibold text-ink shadow-float"
          >
            <span className="flex flex-col leading-tight">
              {t("menu.viewOrder")}
              <small className="text-sm font-normal">{t("menu.items", { count: summary.count })}</small>
            </span>
            <span className="num whitespace-nowrap">{formatAmd(summary.total, locale)}</span>
          </button>
        </div>
      )}
      {sheet && (
        <DishSheet
          key={sheet.id}
          item={sheet}
          canOrder={canOrder}
          onClose={() => setSheet(null)}
          onAdd={(a) => {
            add(sheet, a);
            setSheet(null);
          }}
        />
      )}
      {toast && (
        <p
          key={toast.key}
          aria-hidden="true"
          className={`fixed bottom-[calc(96px+env(safe-area-inset-bottom,0px))] left-1/2 z-30 w-[calc(100%-32px)] max-w-[360px] -translate-x-1/2 rounded-sheet bg-ink px-4 py-3 text-matsoni shadow-float ${styles.toast}`}
        >
          {toast.text}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {toast?.text}
      </p>
    </>
  );
}
