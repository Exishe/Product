"use client";

import { ConciergeBell, Search, ShieldAlert, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flyToCart } from "@/features/guest-theme/motion/fly";
import { warmMotion } from "@/features/guest-theme/motion/motion";
import { sparkFrom } from "@/features/guest-theme/motion/spark";
import { SplitText } from "@/features/guest-theme/motion/split-text";
import { addLine, cartSummary, setQuantity, type CartMenu } from "@/features/ordering/cart";
import { OPEN_CART_KEY, cartKey, useCart } from "@/features/ordering/cart-store";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { hasLastOrder, type SavedLine } from "@/features/ordering/last-order";
import { OrderSender } from "@/features/ordering/order-sender";
import { normalizeForSearch } from "@/lib/format/search";
import { NO_HINTS, pairsFor, type MenuHints } from "./hints";
import { loadAvoid, matchAllergens, saveAvoid, type Allergen } from "./allergens";
import { CallWaiterPrompt, useCallWaiter } from "./call-waiter-button";
import { CartView } from "./cart-view";
import { CategoryNav, sectionId } from "./category-nav";
import { DishCard } from "./dish-card";
import { DishRow } from "./dish-row";
import { DOCK_SPACE, DOCK_SPACE_TALL, GuestDock, type DockItem } from "./guest-dock";
import { GuestHeader, type LanguageLink } from "./guest-header";
import styles from "./guest.module.css";
import { CartBar, OrderPanel } from "./order-panel";
import { initialSelection, selectedIds } from "./selection";
import { Notice, dishPhotoUrl } from "./ui";
import type { GuestItem, GuestMenuData } from "./view-model";

export type TableState =
  { kind: "ok"; id: string; label: string; token: string } | { kind: "none" } | { kind: "invalid" };

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// The dish sheet is needed only after a tap: it arrives on its own once the
// page is idle or first touched (like the animation engine, ADR-052), so the
// first load stays inside the guest JS budget.
const loadSheet = () => import("./dish-sheet");
const DishSheet = lazy(() => loadSheet().then((m) => ({ default: m.DishSheet })));
// "Last time here": fetched only on a phone that has ordered at this café.
const OrderAgain = lazy(() => import("./order-again").then((m) => ({ default: m.OrderAgain })));
// The allergy filter: fetched on the first tap of its button only.
const AllergenFilter = lazy(() => import("./allergen-filter").then((m) => ({ default: m.AllergenFilter })));
const warmSheet = () => {
  const go = () => void loadSheet();
  if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 2000 });
  else setTimeout(go, 300);
  window.addEventListener("pointerdown", go, { once: true, passive: true });
};

const CART_HASH = "#cart";

/** The guest pages' content column: full width on a phone, centred on a desktop. */
const COLUMN = "mx-auto w-full max-w-[1360px] px-4 md:px-8";

const smooth = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

// The featured card of a section (three dishes or more): its first popular
// dish with a photo that can be had today, else its first dish with a photo.
// It spans the row and breaks the grid's rhythm.
function featuredOf(items: GuestItem[]): string | undefined {
  if (items.length < 3) return undefined;
  const pictured = items.filter((i) => i.image && !i.soldOut);
  return (pictured.find((i) => i.tags.includes("popular")) ?? pictured[0])?.id;
}

export function GuestMenu({
  menu,
  table,
  orderHref,
  languages,
  hints = NO_HINTS,
}: {
  menu: GuestMenuData;
  table: TableState;
  /** The order status page for this table. */
  orderHref: string | null;
  languages: LanguageLink[];
  /** Pairs and the usual wait from the café's own rounds (ADR-057). */
  hints?: MenuHints;
}) {
  const { t, locale } = useGuestI18n();
  const tableId = table.kind === "ok" ? table.id : null;
  const [lines, updateCart] = useCart(cartKey(menu.locationId, tableId));
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<GuestItem | null>(null);
  const [view, setView] = useState<"menu" | "cart">("menu");
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [locked, setLocked] = useState(false);
  // What the guest avoids (kept on this phone for every café) and whether
  // the chooser is open.
  const [avoid, setAvoidState] = useState<Allergen[]>([]);
  const [choosingAvoid, setChoosingAvoid] = useState(false);
  const [hasLast, setHasLast] = useState(false);
  // Dishes the database said sold out while sending (the menu was loaded earlier).
  const [soldOutNow, setSoldOutNow] = useState<string[]>([]);
  const menuScroll = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  // The big header has scrolled away: show the slim bar above the tabs.
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const canOrder = menu.ordering && table.kind === "ok";
  const waiter = useCallWaiter();

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

  useEffect(() => warmMotion(), []);
  useEffect(warmSheet, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration (storage is browser-only)
  useEffect(() => setAvoidState(loadAvoid(window.localStorage)), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration (storage is browser-only)
  useEffect(() => setHasLast(hasLastOrder(window.localStorage, menu.locationId)), [menu.locationId]);
  const setAvoid = useCallback((next: Allergen[]) => {
    setAvoidState(next);
    saveAvoid(window.localStorage, next);
  }, []);
  const allergenList = (list: readonly Allergen[]) => list.map((a) => t(`allergens.${a}`)).join(", ");
  // The line under a dish when the guest avoids something: what it contains,
  // or that the café didn't say (never "safe").
  const warningFor = (item: GuestItem) => {
    const m = matchAllergens(item.allergens, avoid);
    return m.kind === "contains"
      ? { text: t("diet.contains", { list: allergenList(m.allergens) }), strong: true }
      : m.kind === "unknown"
        ? { text: t("diet.unknown"), strong: false }
        : null;
  };
  const offerFilter = menu.hasAllergens || avoid.length > 0;

  // The cart is a view of this page with its own history entry, so the
  // phone's back button returns to the menu.
  useEffect(() => {
    // Sent here to see the cart (the order page's "Order the same again"):
    // open it as a tap would, so closing it lands on the menu.
    let openNow = false;
    try {
      openNow = window.sessionStorage.getItem(OPEN_CART_KEY) !== null;
      window.sessionStorage.removeItem(OPEN_CART_KEY);
    } catch {
      // storage blocked: the menu shows with the cart bar instead
    }
    if (openNow && window.location.hash !== CART_HASH) window.history.pushState(null, "", CART_HASH);
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
  const changeQuantity = (id: string, quantity: number) => {
    const next = setQuantity(lines, id, quantity);
    updateCart(() => next);
    return next;
  };

  const add = (item: GuestItem, add: { modifierIds: string[]; quantity: number; note: string }) => {
    updateCart((current) => addLine(current, { itemId: item.id, ...add }, newId));
    setToast({ key: Date.now(), text: t("menu.added", { name: item.name.text }) });
  };
  const addAgain = (again: SavedLine[]) => {
    updateCart((current) =>
      again.reduce((l, a) => addLine(l, { ...a, modifierIds: [...a.modifierIds], note: "" }, newId), current),
    );
    setToast({ key: Date.now(), text: t("again.added") });
  };
  const quickAdd = (item: GuestItem, from: HTMLElement, quantity = 1) => {
    sparkFrom(from);
    flyToCart(from, {
      photo: item.image ? dishPhotoUrl(item.image) : null,
      initial: "",
    });
    add(item, {
      modifierIds: selectedIds(item.groups, initialSelection(item.groups)),
      quantity,
      note: "",
    });
  };
  const findDish = () => {
    search.current?.scrollIntoView({ behavior: smooth(), block: "center" });
    search.current?.focus({ preventScroll: true });
  };

  const orderingNotice =
    table.kind === "invalid" ? (
      <Notice tone="alert">{t("menu.badTable")}</Notice>
    ) : !menu.ordering ? (
      <Notice tone="calm">{t("menu.orderingOff")}</Notice>
    ) : table.kind === "none" ? (
      <Notice tone="info">{t("menu.noTable")}</Notice>
    ) : null;

  const count = summary.count;
  // The first featured photo on the page is fetched at once (likely the LCP).
  const firstFeatured = shown.map((c) => featuredOf(c.items)).find(Boolean);
  const orderLabel = count > 0 ? t("nav.orderCount", { count }) : t("nav.order");
  const iconButton =
    "bg-surface text-ink shadow-card relative grid size-12 flex-none place-items-center rounded-full border [border-color:var(--guest-card-border)] disabled:opacity-60";
  const tools = (
    <span className="flex flex-none items-center gap-2">
      <button type="button" className={iconButton} aria-label={t("menu.searchOpen")} onClick={findDish}>
        <Search size={20} aria-hidden />
      </button>
      {(canOrder || lines.length > 0) && (
        <button
          type="button"
          className={iconButton}
          aria-label={orderLabel}
          disabled={lines.length === 0}
          onClick={openCart}
        >
          <ShoppingBag size={20} aria-hidden />
          {count > 0 && (
            <span className="num bg-badge text-on-badge absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs font-bold">
              {count}
            </span>
          )}
        </button>
      )}
    </span>
  );
  const header = (
    <GuestHeader
      cafeName={menu.restaurantName}
      logoUrl={menu.logo ? dishPhotoUrl(menu.logo) : null}
      tableLabel={table.kind === "ok" ? table.label : null}
      languages={languages}
      tools={view === "menu" ? tools : undefined}
    />
  );

  const dockItems: DockItem[] =
    table.kind === "ok"
      ? [
          {
            key: "menu",
            label: t("nav.menu"),
            icon: <UtensilsCrossed size={22} aria-hidden />,
            current: view === "menu",
            onClick: () => window.scrollTo({ top: 0, behavior: smooth() }),
          },
          lines.length > 0 || !orderHref
            ? {
                key: "order",
                label: t("nav.order"),
                ariaLabel: orderLabel,
                icon: <ShoppingBag size={22} aria-hidden />,
                badge: count,
                disabled: lines.length === 0,
                onClick: openCart,
              }
            : {
                key: "order",
                label: t("nav.order"),
                icon: <ShoppingBag size={22} aria-hidden />,
                href: orderHref,
              },
          ...(canOrder
            ? [
                {
                  key: "waiter",
                  label: t("nav.waiter"),
                  icon: <ConciergeBell size={22} aria-hidden />,
                  pressed: waiter.state !== "idle",
                  onClick: waiter.ask,
                  testId: "call-waiter-nav",
                },
              ]
            : []),
        ]
      : [];

  if (view === "cart" && lines.length > 0) {
    return (
      <>
        {header}
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
          wait={menu.kitchenBusy ? null : hints.wait}
          onQuantity={(id, quantity) => {
            // removing the last line returns to the menu (screens.md)
            if (changeQuantity(id, quantity).length === 0) closeCart();
          }}
          onBack={closeCart}
        />
      </>
    );
  }

  return (
    <>
      {header}
      {/* Right under the header: once it has scrolled away, the slim bar shows. */}
      <div ref={sentinel} aria-hidden="true" />
      {/* Fixed, not in the flow: showing it never shifts the menu under the finger. */}
      <div
        className={`bg-page/95 border-line fixed inset-x-0 top-0 z-20 border-b backdrop-blur-md ${styles.slim}`}
        data-shown={scrolled}
        data-testid="slim-bar"
        inert={!scrolled}
      >
        <div className={`${COLUMN} flex h-16 items-center gap-3`}>
          <span className="display-face min-w-0 flex-1 truncate text-2xl">{menu.restaurantName}</span>
          {table.kind === "ok" && (
            <span className="border-line-strong/60 rounded-pill flex-none border px-2.5 py-0.5 text-sm font-semibold">
              {t("table", { label: table.label })}
            </span>
          )}
          {tools}
        </div>
      </div>
      <div className={`${COLUMN} flex-1 ${lines.length > 0 ? DOCK_SPACE_TALL : DOCK_SPACE} lg:pb-24`}>
        {(orderingNotice || menu.kitchenBusy) && (
          <div className="grid gap-2 pt-4">
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
        {canOrder && hasLast && lines.length === 0 && (
          <Suspense fallback={null}>
            <OrderAgain locationId={menu.locationId} items={items} menu={cartMenu} onAdd={addAgain} />
          </Suspense>
        )}
        <div className="flex items-center gap-2 pt-5 pb-2">
          <div className="relative min-w-0 flex-1 md:max-w-[440px]">
            <label className="sr-only" htmlFor="menu-search">
              {t("menu.search")}
            </label>
            <Search
              size={18}
              aria-hidden
              className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
            />
            <input
              ref={search}
              id="menu-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("menu.search")}
              autoComplete="off"
              enterKeyHint="search"
              className="bg-surface shadow-card placeholder:text-muted focus:border-accent-text rounded-pill min-h-12 w-full border [border-color:var(--guest-field-edge)] pr-5 pl-11"
            />
          </div>
          {offerFilter && (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-pressed={avoid.length > 0}
              onClick={() => setChoosingAvoid(true)}
              data-testid="allergy-filter"
              className="bg-surface shadow-card rounded-pill aria-pressed:bg-accent aria-pressed:text-on-accent inline-flex min-h-12 flex-none items-center gap-2 border [border-color:var(--guest-field-edge)] px-4 text-sm font-semibold"
            >
              <ShieldAlert size={18} aria-hidden />
              {avoid.length ? t("diet.openCount", { count: avoid.length }) : t("diet.open")}
            </button>
          )}
        </div>
        {avoid.length > 0 && (
          <p className="text-muted pb-1 text-sm" role="status">
            {t("diet.active", { list: allergenList(avoid) })} {t("diet.tellWaiter")}
          </p>
        )}
        <CategoryNav categories={shown} belowBar={scrolled} />
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_13.5rem] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_14.5rem] xl:gap-14">
          <main className="min-w-0">
            {shown.length === 0 ? (
              <p className="text-muted py-12 text-center" role="status">
                {t("menu.noResults")}
              </p>
            ) : (
              shown.map((c, at) => {
                // Plates only where there is food to show: a section where at
                // least half the dishes have photos is a grid of plates; any
                // other reads as a printed menu (DishRow), led by its featured
                // photo when it has one. No rows of identical empty plates.
                const plates = c.items.filter((i) => i.image).length * 2 >= c.items.length;
                const featured = featuredOf(c.items);
                // The dish's place on the page, counted over the sections before.
                const before = shown.slice(0, at).reduce((n, x) => n + x.items.length, 0);
                return (
                  <section
                    key={c.id}
                    id={sectionId(c.id)}
                    aria-labelledby={`h-${c.id}`}
                    className="scroll-mt-36 pt-8"
                  >
                    {c.name && (
                      <SplitText
                        as="h2"
                        id={`h-${c.id}`}
                        text={c.name.text}
                        lang={c.name.lang === locale ? undefined : c.name.lang}
                        className={`display-face text-title mb-5 block text-[2.125rem] leading-[1.02] break-words hyphens-auto md:text-[2.75rem] ${styles.sectionTitle}`}
                      />
                    )}
                    {!plates ? (
                      <div
                        className={
                          featured
                            ? "grid gap-5 md:grid-cols-2 md:items-start lg:grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
                            : undefined
                        }
                      >
                        {featured && (
                          <ul className="grid grid-cols-2">
                            {c.items
                              .filter((item) => item.id === featured)
                              .map((item) => (
                                <DishCard
                                  key={item.id}
                                  item={item}
                                  canOrder={canOrder}
                                  warning={warningFor(item)}
                                  featured
                                  priority={item.id === firstFeatured}
                                  index={before}
                                  onOpen={setSheet}
                                  onQuickAdd={quickAdd}
                                />
                              ))}
                          </ul>
                        )}
                        <ul
                          className={`bg-surface shadow-card rounded-feature border [border-color:var(--guest-card-border)] px-5 py-1 sm:px-7 ${featured ? "" : "md:columns-2 md:gap-12"}`}
                        >
                          {c.items
                            .filter((item) => item.id !== featured)
                            .map((item) => (
                              <DishRow
                                key={item.id}
                                item={item}
                                canOrder={canOrder}
                                warning={warningFor(item)}
                                onOpen={setSheet}
                                onQuickAdd={quickAdd}
                              />
                            ))}
                        </ul>
                      </div>
                    ) : (
                      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 max-[359px]:grid-cols-1 md:grid-cols-3 md:gap-x-5 lg:grid-cols-2 xl:grid-cols-3">
                        {/* The featured dish leads its section, so the grid below it stays whole. */}
                        {[...c.items]
                          .sort((a, b) => Number(b.id === featured) - Number(a.id === featured))
                          .map((item, i) => (
                            <DishCard
                              key={item.id}
                              item={item}
                              canOrder={canOrder}
                              warning={warningFor(item)}
                              featured={item.id === featured}
                              priority={item.id === firstFeatured}
                              index={before + i}
                              onOpen={setSheet}
                              onQuickAdd={quickAdd}
                            />
                          ))}
                      </ul>
                    )}
                  </section>
                );
              })
            )}
          </main>
          <div className="hidden pt-8 lg:block">
            <div className="sticky top-36">
              <OrderPanel
                summary={summary}
                items={items}
                onOpen={openCart}
                onRemove={(id) => changeQuantity(id, 0)}
              />
            </div>
          </div>
        </div>
      </div>
      <GuestDock
        items={dockItems}
        above={
          <>
            {canOrder && table.kind === "ok" && <CallWaiterPrompt token={table.token} tableId={table.id} />}
            {lines.length > 0 && (
              <div className="lg:hidden">
                <CartBar summary={summary} items={items} onOpen={openCart} />
              </div>
            )}
          </>
        }
      />
      {sheet && (
        <Suspense fallback={null}>
          <DishSheet
            key={sheet.id}
            item={sheet}
            canOrder={canOrder}
            pairs={pairsFor(sheet.id, hints, items, soldOutNow)}
            onAddPair={quickAdd}
            onOpenPair={setSheet}
            onClose={() => setSheet(null)}
            onAdd={(a) => {
              add(sheet, a);
              setSheet(null);
            }}
          />
        </Suspense>
      )}
      {choosingAvoid && (
        <Suspense fallback={null}>
          <AllergenFilter avoid={avoid} onChange={setAvoid} onClose={() => setChoosingAvoid(false)} />
        </Suspense>
      )}
      {toast && (
        <p
          key={toast.key}
          aria-hidden="true"
          className={`bg-deep text-deep-ink shadow-float rounded-card fixed bottom-[calc(172px+env(safe-area-inset-bottom,0px))] left-1/2 z-40 w-[calc(100%-32px)] max-w-[360px] -translate-x-1/2 px-5 py-3 text-center lg:bottom-[calc(104px+env(safe-area-inset-bottom,0px))] ${styles.toast}`}
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
