"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addLine, cartSummary, setQuantity, type CartMenu } from "@/features/ordering/cart";
import { cartKey, useCart } from "@/features/ordering/cart-store";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { OrderSender } from "@/features/ordering/order-sender";
import { formatAmd } from "@/lib/format/money";
import { normalizeForSearch } from "@/lib/format/search";
import { CallWaiterButton } from "./call-waiter-button";
import { CartView } from "./cart-view";
import { CategoryNav, sectionId } from "./category-nav";
import { CircularCarousel, type CarouselItem } from "./circular-carousel";
import { DishRow } from "./dish-row";
import { DishSheet } from "./dish-sheet";
import styles from "./guest.module.css";
import { initialSelection, selectedIds } from "./selection";
import { Notice, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem, GuestMenuData } from "./view-model";

export type TableState =
  { kind: "ok"; id: string; label: string; token: string } | { kind: "none" } | { kind: "invalid" };

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const CART_HASH = "#cart";
const SIGNATURE_MAX = 10;
const SIGNATURE_MIN = 3;

// Dishes for the "signature" cylinder: those with a photo that can be had
// today, popular ones first, up to ten. Fewer than three: no cylinder.
function signatureDishes(menu: GuestMenuData): GuestItem[] {
  const withPhoto = menu.categories.flatMap((c) => c.items).filter((i) => i.image && !i.soldOut);
  const picked = [
    ...withPhoto.filter((i) => i.tags.includes("popular")),
    ...withPhoto.filter((i) => !i.tags.includes("popular")),
  ].slice(0, SIGNATURE_MAX);
  return picked.length >= SIGNATURE_MIN ? picked : [];
}

/** The guest pages' content column: full width on a phone, centred on a desktop. */
const COLUMN = "mx-auto w-full max-w-[1200px] px-4 md:px-8";

export function GuestMenu({
  menu,
  table,
  orderHref,
}: {
  menu: GuestMenuData;
  table: TableState;
  /** The order status page for this table. */
  orderHref: string | null;
}) {
  const { t, locale } = useGuestI18n();
  const tableId = table.kind === "ok" ? table.id : null;
  const [lines, updateCart] = useCart(cartKey(menu.locationId, tableId));
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<GuestItem | null>(null);
  const [view, setView] = useState<"menu" | "cart">("menu");
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [locked, setLocked] = useState(false);
  // Dishes the database said sold out while sending (the menu was loaded earlier).
  const [soldOutNow, setSoldOutNow] = useState<string[]>([]);
  const menuScroll = useRef(0);
  // The big header has scrolled away: show the slim bar above the tabs.
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const canOrder = menu.ordering && table.kind === "ok";

  const items = useMemo(
    () => Object.fromEntries(menu.categories.flatMap((c) => c.items.map((i) => [i.id, i]))),
    [menu],
  );
  const cartMenu: CartMenu = useMemo(
    () =>
      Object.fromEntries(
        Object.values(items).map((i) => [
          i.id,
          {
            price: i.price,
            soldOut: i.soldOut || soldOutNow.includes(i.id),
            groups: i.groups.map((g) => ({
              ...g,
              modifiers: g.modifiers.map((m) => ({ id: m.id, delta: m.delta })),
            })),
          },
        ]),
      ),
    [items, soldOutNow],
  );
  const summary = useMemo(() => cartSummary(lines, cartMenu), [lines, cartMenu]);
  const signature = useMemo(() => signatureDishes(menu), [menu]);
  const signatureItems: CarouselItem[] = useMemo(
    () =>
      signature.map((i) => ({
        src: dishPhotoUrl(i.image as string),
        alt: i.name.text,
        title: i.name.text,
        subtitle: formatAmd(i.price, locale),
        lang: i.name.lang === locale ? undefined : i.name.lang,
      })),
    [signature, locale],
  );

  const q = normalizeForSearch(query);
  const shown = useMemo(
    () =>
      q
        ? menu.categories
            .map((c) => ({ ...c, items: c.items.filter((i) => i.search.includes(q)) }))
            .filter((c) => c.items.length)
        : menu.categories,
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
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry && setScrolled(!entry.isIntersecting && entry.boundingClientRect.top < 0),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const onSoldOut = useCallback(
    (itemId: string) => setSoldOutNow((ids) => (ids.includes(itemId) ? ids : [...ids, itemId])),
    [],
  );
  const clearCart = useCallback(() => updateCart(() => []), [updateCart]);

  const add = (item: GuestItem, add: { modifierIds: string[]; quantity: number; note: string }) => {
    updateCart((current) => addLine(current, { itemId: item.id, ...add }, newId));
    setToast({ key: Date.now(), text: t("menu.added", { name: item.name.text }) });
  };
  const quickAdd = (item: GuestItem) =>
    add(item, {
      modifierIds: selectedIds(item.groups, initialSelection(item.groups)),
      quantity: 1,
      note: "",
    });

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
        notice={
          orderingNotice ?? (summary.blocked ? <Notice tone="alert">{t("cart.soldOut")}</Notice> : null)
        }
        footer={
          canOrder && table.kind === "ok" && orderHref ? (
            <OrderSender
              summary={summary}
              locationId={menu.locationId}
              table={table}
              orderHref={orderHref}
              onLocked={setLocked}
              onSoldOut={onSoldOut}
              onPlaced={clearCart}
            />
          ) : null
        }
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
      {/* Right under the header: once it has scrolled away, the slim bar shows. */}
      <div ref={sentinel} aria-hidden="true" />
      {(orderingNotice || menu.kitchenBusy) && (
        <div className={`${COLUMN} grid gap-2 pt-4`}>
          {orderingNotice}
          {menu.kitchenBusy && canOrder && (
            <Notice tone="busy">
              {menu.kitchenBusy.minutes
                ? t("menu.kitchenBusy", { minutes: menu.kitchenBusy.minutes })
                : t("menu.kitchenBusyNoTime")}
            </Notice>
          )}
        </div>
      )}
      {signature.length > 0 && (
        <section aria-labelledby="signature-title" className={`${COLUMN} pt-6 md:pt-10`} data-testid="signature">
          <h2 id="signature-title" className="display-face text-center text-[1.75rem] leading-tight md:text-[2.25rem]">
            {t("menu.signature.title")}
          </h2>
          <span aria-hidden="true" className="bg-champagne mx-auto mt-3 block h-px w-12" />
          <CircularCarousel
            items={signatureItems}
            preset="cylinder"
            intro="rise"
            cardWidth={240}
            aspectRatio={1}
            speed={14}
            captions
            className="h-[290px] sm:h-[330px] md:h-[380px] lg:h-[400px]"
            label={t("menu.signature.title")}
            hint={t("menu.signature.hint")}
            roleDescription={t("menu.signature.carousel")}
            onSelect={(i) => {
              const item = signature[i];
              if (item) setSheet(item);
            }}
          />
        </section>
      )}
      {/* Fixed, not in the flow: showing it never shifts the menu under the finger. */}
      <div
        className={`bg-band text-band-ink fixed inset-x-0 top-0 z-20 ${styles.slim}`}
        data-shown={scrolled}
        data-testid="slim-bar"
        inert={!scrolled}
      >
        <div className={`${COLUMN} flex h-14 items-center gap-3`}>
          <span className="display-face text-band-accent min-w-0 flex-1 truncate text-xl md:text-2xl">
            {menu.restaurantName}
          </span>
          {table.kind === "ok" && (
            <span className="border-band-line/50 text-band-accent flex-none rounded-full border px-2.5 py-0.5 text-sm font-semibold">
              {t("table", { label: table.label })}
            </span>
          )}
          {canOrder && table.kind === "ok" && (
            <CallWaiterButton token={table.token} tableId={table.id} compact />
          )}
        </div>
      </div>
      <div className={`${COLUMN} flex-1 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-14`}>
        <div className="pt-6 pb-3 lg:col-start-2 lg:row-start-1 lg:pt-10 lg:pb-0">
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
            className="border-line-strong placeholder:text-muted focus:border-gold-deep min-h-12 w-full rounded-full border bg-white px-5 md:max-w-[420px]"
          />
        </div>
        <CategoryNav categories={shown} belowBar={scrolled} />
        <main className="pb-10 lg:col-start-2 lg:row-start-2">
          {shown.length === 0 ? (
            <p className="text-muted py-12 text-center" role="status">
              {t("menu.noResults")}
            </p>
          ) : (
            shown.map((c) => (
              <section
                key={c.id}
                id={sectionId(c.id)}
                aria-labelledby={`h-${c.id}`}
                className="scroll-mt-32 pt-8 lg:scroll-mt-20"
              >
                {c.name && (
                  <div className="mb-1 flex items-center gap-4">
                    <Txt
                      as="h2"
                      id={`h-${c.id}`}
                      value={c.name}
                      locale={locale}
                      className="display-face min-w-0 text-[1.875rem] leading-tight [overflow-wrap:anywhere] md:text-[2.125rem]"
                    />
                    <span aria-hidden="true" className="bg-line h-px min-w-6 flex-1 translate-y-1" />
                  </div>
                )}
                <ul className="md:grid md:grid-cols-2 md:gap-x-10">
                  {c.items.map((item) => (
                    <DishRow
                      key={item.id}
                      item={item}
                      canOrder={canOrder}
                      onOpen={setSheet}
                      onQuickAdd={quickAdd}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </main>
      </div>
      {lines.length > 0 && (
        <div className="from-matsoni sticky bottom-0 z-10 bg-linear-to-t from-60% to-transparent px-4 pt-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={openCart}
            className="bg-noir text-ivory shadow-float ring-champagne/60 mx-auto flex min-h-14 w-full max-w-[560px] items-center justify-between gap-3 rounded-full py-2 pr-6 pl-6 text-left font-semibold ring-1"
          >
            <span className="flex flex-col leading-tight">
              {t("menu.viewOrder")}
              <small className="text-ivory-dim text-sm font-normal">{t("menu.items", { count: summary.count })}</small>
            </span>
            <span className="num text-champagne-light text-lg whitespace-nowrap">{formatAmd(summary.total, locale)}</span>
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
          className={`bg-noir text-ivory shadow-float fixed bottom-[calc(96px+env(safe-area-inset-bottom,0px))] left-1/2 z-30 w-[calc(100%-32px)] max-w-[360px] -translate-x-1/2 rounded-2xl px-5 py-3 text-center ${styles.toast}`}
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
