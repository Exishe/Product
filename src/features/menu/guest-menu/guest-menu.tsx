"use client";

import { ConciergeBell, QrCode, Search, ShoppingBag, SlidersHorizontal, UtensilsCrossed } from "./icons";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { makeTrack } from "@/features/analytics/track";
import { flyToCart } from "@/features/guest-theme/motion/fly";
import { warmMotion } from "@/features/guest-theme/motion/motion";
import { sparkFrom } from "@/features/guest-theme/motion/spark";
import { useMenuStatus } from "@/features/availability/use-menu-status";
import { addLine, cartSummary, setQuantity, type CartMenu } from "@/features/ordering/cart";
import { OPEN_CART_KEY, cartKey, useCart } from "@/features/ordering/cart-store";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { hasLastOrder, type SavedLine } from "@/features/ordering/last-order";
import { hasRequestLeft } from "@/features/ordering/pending-request-key";
import type { SubInfo } from "@/features/ordering/substitutions-parse";
import { NO_HINTS, type MenuHints } from "./hints";
import { loadAvoid, matchAllergens, saveAvoid, type Allergen } from "./allergens";
import { matchesDiet, type DietFilter } from "./diet-filter";
import { useCallWaiter } from "./call-waiter-state";
import { CategoryNav, sectionId } from "./category-nav";
import { SectionList } from "./section-list";
import { DishRow } from "./dish-row";
import { groupSections } from "./section-groups";
import { DOCK_SPACE, DOCK_SPACE_TALL, GuestDock, type DockItem } from "./guest-dock";
import { GuestHeader, type LanguageLink } from "./guest-header";
import { MenuBar } from "./menu-bar";
import { CartBar } from "./order-panel";
import { initialSelection, selectedIds } from "./selection";
import type { SubAsk } from "./subs-dialog";
import { CheckIcon, CloseIcon, Notice, dishPhotoUrl } from "./ui";
import { sameNamed, type GuestItem, type GuestMenuData } from "./view-model";

export type TableState =
  { kind: "ok"; id: string; label: string; token: string } | { kind: "none" } | { kind: "invalid" };

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// The dish sheet is needed only after a tap: it arrives on the first touch,
// move or scroll (warmSheet), so the first load stays inside the guest JS budget.
const loadSheet = () => import("./dish-sheet");
const DishSheet = lazy(() => loadSheet().then((m) => ({ default: m.DishSheet })));
// The accepted-substitution bookkeeping loads only for a menu with a substituted dish.
const loadSubs = () => import("@/features/ordering/substitutions");
// "Made with X instead of Y, OK?" (ADR-076): fetched the first time a substituted dish is added.
const SubsDialog = lazy(() => import("./subs-dialog").then((m) => ({ default: m.SubsDialog })));
// "Goes well with" (ADR-077): fetched when the first dish is added, never at first paint.
const Suggestions = lazy(() => import("./suggestions").then((m) => ({ default: m.Suggestions })));
// "Last time here": fetched only on a phone that has ordered at this café.
const OrderAgain = lazy(() => import("./order-again").then((m) => ({ default: m.OrderAgain })));
// The desktop's order rail: fetched only at 1024 px and up.
const OrderRail = lazy(() => import("./order-rail").then((m) => ({ default: m.OrderRail })));
// The allergy filter: fetched on the first tap of its button only.
const AllergenFilter = lazy(() => import("./allergen-filter").then((m) => ({ default: m.AllergenFilter })));
// The order view and its send area are needed only once something is in the
// cart: fetched then (the cart's first line, or a cart kept from an earlier visit).
const loadCart = () => import("./cart-view");
const loadSender = () => import("@/features/ordering/order-sender");
const CartView = lazy(() => loadCart().then((m) => ({ default: m.CartView })));
const OrderSender = lazy(() => loadSender().then((m) => ({ default: m.OrderSender })));
// First sign of a hand on the page (move, touch, scroll, key): by the time a
// dish is tapped its sheet is already on the way. Not at idle: a guest who only
// looks at the menu never downloads it.
const WARM_ON = ["pointermove", "pointerdown", "touchstart", "scroll", "keydown"] as const;
// The waiter's question: its code arrives when the question first shows (a tap
// on the Waiter item, or a request left unsent before a reload).
const loadPrompt = () => import("./call-waiter-button");
const CallWaiterPrompt = lazy(() => loadPrompt().then((m) => ({ default: m.CallWaiterPrompt })));
const warmSheet = () => {
  const go = () => {
    void loadSheet();
    stop();
  };
  const stop = () => WARM_ON.forEach((e) => window.removeEventListener(e, go));
  WARM_ON.forEach((e) => window.addEventListener(e, go, { passive: true }));
  return stop;
};

const CART_HASH = "#cart";

// The guest pages' content column: full width on a phone, centred on a desktop
// and as wide as the menu bar (menu-bar.tsx, 1240 px), so they line up. From
// 1024 px it holds three columns: the section list, the dishes and the order
// rail; the notices above the dishes sit in the middle one too.
const COLUMN = "mx-auto w-full max-w-[1240px] px-4 md:px-8";
const THREE_UP =
  "lg:grid lg:grid-cols-[13rem_minmax(0,1fr)_20rem] lg:gap-6 xl:grid-cols-[14rem_minmax(0,1fr)_22rem] xl:gap-10";
/** Where the desktop's side columns stick: just under the sticky band, level with the first heading. */
const SIDE_TOP = "top-[calc(var(--guest-sticky,4rem)+1.25rem)]";

const smooth = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

// A desktop: the order rail is on screen (and sends the order itself).
const WIDE = "(min-width: 1024px)";
const subscribeWide = (onChange: () => void) => {
  const media = window.matchMedia(WIDE);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const noSubscription = () => () => {};

// "Ordering is paused for a few minutes", with the time it resumes when the
// café gave minutes. The time is read on the phone (it is at the café), so the
// server render says the same thing without it.
function PausedText({ until }: { until: string | null }) {
  const { t, locale } = useGuestI18n();
  const time = useSyncExternalStore(
    noSubscription,
    () =>
      until
        ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(until))
        : null,
    () => null,
  );
  if (!until) return <>{t("menu.pausedNoEnd")}</>;
  return <>{time ? t("menu.pausedUntil", { time }) : t("menu.paused")}</>;
}

export function GuestMenu({
  menu,
  table,
  orderHref,
  languages,
  hints = NO_HINTS,
  promoBanners = null,
  reloadMenu,
}: {
  menu: GuestMenuData;
  table: TableState;
  /** The order status page for this table. */
  orderHref: string | null;
  languages: LanguageLink[];
  /** Pairs and the usual wait from the café's own rounds (ADR-060). */
  hints?: MenuHints;
  /** The promo banners in the language on screen (promo-banner.tsx). */
  promoBanners?: ReactNode;
  /** Reloads the menu data in place when the café's status changes (ADR-068, ADR-092). */
  reloadMenu?: () => void;
}) {
  const { t, locale } = useGuestI18n();
  const tableId = table.kind === "ok" ? table.id : null;
  const [lines, updateCart] = useCart(cartKey(menu.locationId, tableId));
  const track = useMemo(() => makeTrack(menu.locationId, tableId), [menu.locationId, tableId]);
  const [query, setQuery] = useState("");
  const [fold, setFold] = useState<((text: string) => string) | null>(null);
  const [sheet, setSheet] = useState<GuestItem | null>(null);
  const [view, setView] = useState<"menu" | "cart">("menu");
  // The dish just added, which asks the server for "goes well with" ideas.
  const [suggest, setSuggest] = useState<{ id: string; cart: string[]; n: number } | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [locked, setLocked] = useState(false);
  // What the guest avoids (kept on this phone for every café) and whether
  // the chooser is open.
  const [avoid, setAvoidState] = useState<Allergen[]>([]);
  // The "show only" chips (vegetarian, spicy, …): for this visit only, not kept.
  const [diet, setDiet] = useState<DietFilter[]>([]);
  const [choosingAvoid, setChoosingAvoid] = useState(false);
  const [hasLast, setHasLast] = useState(false);
  // Dishes the database said sold out while sending (the menu was loaded earlier).
  const [soldOutNow, setSoldOutNow] = useState<string[]>([]);
  // Dishes made with a replacement today: the guest accepts each once per visit (ADR-076).
  const [ask, setAsk] = useState<{ entry: SubAsk; run: () => void } | null>(null);
  const menuScroll = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  const canOrder = menu.ordering && !menu.paused && !menu.closed && table.kind === "ok";
  // Sold-out, pause, closed kitchen and section hours change while the menu is open (ADR-068).
  useMenuStatus(menu.locationId, menu.status, reloadMenu);
  const waiter = useCallWaiter();
  // The question is mounted once it has shown, or at once when this table has a
  // request left unsent (checked after hydration: storage is browser-only).
  const [leftUnsent, setLeftUnsent] = useState(false);
  const [askedBefore, setAskedBefore] = useState(false);
  if (waiter.state !== "idle" && !askedBefore) setAskedBefore(true);

  const items = useMemo(
    () => Object.fromEntries(menu.categories.flatMap((c) => c.items.map((i) => [i.id, i]))),
    [menu],
  );
  // The open dish as the menu on screen has it: after a language switch its
  // sheet shows the new language and keeps the guest's choices (ADR-092).
  const openDish = sheet ? (items[sheet.id] ?? sheet) : null;
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
  // How many of each dish the order holds: the rows show it on their add control.
  const inCart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of lines) counts[l.itemId] = (counts[l.itemId] ?? 0) + l.quantity;
    return counts;
  }, [lines]);
  const subs = useMemo(
    () =>
      Object.fromEntries(
        Object.values(items).flatMap((i): [string, SubInfo][] =>
          i.substitution ? [[i.id, i.substitution]] : [],
        ),
      ),
    [items],
  );

  const ambiguous = useMemo(() => sameNamed(menu.categories), [menu]);
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );

  // Dishes by name in any script; a section's own name («սպիտակ գինի»,
  // "white wine") brings the whole section. Results stay under their section
  // titles, so a found wine says which list it is on. While searching,
  // sections show without their cover photos.
  // The folding table (Armenian and Russian letters to Latin) is fetched on the
  // first keystroke; until it is here the whole menu stays on screen.
  const q = fold ? fold(query) : "";
  const shown = useMemo(() => {
    const base = diet.length
      ? menu.categories
          .map((c) => ({ ...c, items: c.items.filter((i) => matchesDiet(i, diet)) }))
          .filter((c) => c.items.length)
      : menu.categories;
    return q
      ? base
          .map((c) =>
            c.search.includes(q)
              ? { ...c, cover: null }
              : { ...c, cover: null, items: c.items.filter((i) => i.search.includes(q)) },
          )
          .filter((c) => c.items.length)
      : base;
  }, [menu.categories, q, diet]);

  useEffect(() => warmMotion(), []);
  const hasLines = lines.length > 0;
  useEffect(() => {
    if (!hasLines) return;
    void loadCart();
    void loadSender();
  }, [hasLines]);
  useEffect(warmSheet, []);
  // A table that can order gets the waiter's question at idle: calling the
  // waiter must work with no signal, so its code is on the phone beforehand.
  const callsWaiter = canOrder && table.kind === "ok";
  useEffect(() => {
    if (!callsWaiter) return;
    const go = () => void loadPrompt().then((m) => m.warmSender());
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(go, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(go, 300);
    return () => clearTimeout(id);
  }, [callsWaiter]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration (storage is browser-only)
  useEffect(() => setAvoidState(loadAvoid(window.localStorage)), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration (storage is browser-only)
  useEffect(() => setHasLast(hasLastOrder(window.localStorage, menu.locationId)), [menu.locationId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration (storage is browser-only)
    setLeftUnsent(table.kind === "ok" && hasRequestLeft(window.localStorage, table.id));
  }, [table]);
  const setAvoid = useCallback((next: Allergen[]) => {
    setAvoidState(next);
    saveAvoid(window.localStorage, next);
  }, []);
  const allergenList = (list: readonly Allergen[]) => list.map((a) => t(`allergens.${a}`)).join(", ");
  // The line under a dish when the guest avoids something: what it contains,
  // or that the café didn't say (never "safe").
  const warningFor = (item: GuestItem) => {
    const m = matchAllergens(item.allergens, avoid, item.allergensConfirmed);
    return m.kind === "contains"
      ? { text: t("diet.contains", { list: allergenList(m.allergens) }), strong: true }
      : m.kind === "unknown"
        ? { text: t("diet.unknown"), strong: false }
        : null;
  };
  const offerFilter = menu.hasAllergens || menu.hasDietTags || avoid.length > 0 || diet.length > 0;
  const filterCount = avoid.length + diet.length;

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
    setSuggest(null);
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

  const add = (
    item: GuestItem,
    add: { modifierIds: string[]; quantity: number; note: string },
    via?: "suggest",
  ) => {
    updateCart((current) => addLine(current, { itemId: item.id, ...add }, newId));
    track(
      "item_add",
      item.id,
      via ? { qty: Math.min(add.quantity, 99), via } : { qty: Math.min(add.quantity, 99) },
    );
    // A dish added from a suggestion does not start another round of ideas.
    if (!via && canOrder) {
      setSuggest({
        id: item.id,
        cart: [...new Set([...lines.map((l) => l.itemId), item.id])],
        n: Date.now(),
      });
    }
    setToast({ key: Date.now(), text: t("menu.added", { name: item.name.text }) });
  };
  const addAgain = (again: SavedLine[]) => {
    updateCart((current) =>
      again.reduce((l, a) => addLine(l, { ...a, modifierIds: [...a.modifierIds], note: "" }, newId), current),
    );
    for (const a of again) track("item_add", a.itemId, { qty: Math.min(a.quantity, 99), via: "again" });
    setToast({ key: Date.now(), text: t("again.added") });
  };
  // A dish made with a replacement asks once per visit before it is added.
  const gate = (item: GuestItem, run: () => void) => {
    const sub = item.substitution;
    if (!sub) return run();
    void loadSubs().then((m) => {
      if (m.isAccepted(menu.locationId, sub)) run();
      else setAsk({ entry: { sub, name: item.name.text, price: item.price }, run });
    });
  };
  const removeDishes = useCallback(
    (itemIds: string[]) => {
      const next = lines.filter((l) => !itemIds.includes(l.itemId));
      updateCart(() => next);
      if (next.length === 0) closeCart();
    },
    [lines, updateCart, closeCart],
  );
  // «−» on a dish's pill: one less of its newest line; at one, the line goes.
  const decrease = (item: GuestItem) => {
    const line = lines.findLast((l) => l.itemId === item.id);
    if (!line) return;
    if (changeQuantity(line.id, line.quantity - 1).length === 0) setSuggest(null);
  };
  const quickAdd = (item: GuestItem, from: HTMLElement, quantity = 1, via?: "suggest") =>
    gate(item, () => {
      sparkFrom(from);
      flyToCart(from, { photo: item.image ? dishPhotoUrl(item.image) : null });
      add(
        item,
        {
          modifierIds: selectedIds(item.groups, initialSelection(item.groups)),
          quantity,
          note: "",
        },
        via,
      );
    });

  const orderingNotice =
    table.kind === "invalid" ? (
      <Notice tone="alert">{t("menu.badTable")}</Notice>
    ) : !menu.ordering ? (
      <Notice tone="calm">{t("menu.orderingOff")}</Notice>
    ) : menu.closed ? (
      <Notice tone="calm">{t("menu.closedToday")}</Notice>
    ) : menu.paused ? (
      <Notice tone="calm">
        <PausedText until={menu.paused.until} />
      </Notice>
    ) : null;

  const count = summary.count;
  // The first featured photo on the page is fetched at once (likely the LCP).
  const orderLabel = count > 0 ? t("nav.orderCount", { count }) : t("nav.order");
  const iconButton =
    "bg-surface text-ink relative grid size-11 flex-none place-items-center rounded-full border [border-color:var(--guest-line-strong)] disabled:opacity-60 max-lg:hidden";
  // From 1024 px only: a phone and a tablet have the cart bar and the Order tab.
  const tools = (
    <span className="flex flex-none items-center gap-2 empty:hidden max-lg:hidden">
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
            <span className="num bg-badge text-on-badge absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-meta font-bold">
              {count}
            </span>
          )}
        </button>
      )}
    </span>
  );
  // The rail's quiet actions: 48 px rows on hairlines, not outlined pills, so they never wrap.
  const railAction =
    "text-ink hover:bg-chip aria-expanded:bg-chip border-line -mx-2 flex min-h-12 items-center gap-3 rounded-guest-md border-b px-2 text-body font-semibold last:border-b-0";
  // The café's name leads to the top of the menu: from the order view it closes it
  // (the cart stays in the browser), on the menu it scrolls up.
  const home = {
    href: languages.find((l) => l.locale === locale)?.href ?? ".",
    onGo: () => {
      if (view === "cart") {
        menuScroll.current = 0;
        closeCart();
      }
      window.scrollTo({ top: 0, behavior: smooth() });
    },
  };
  const header = (
    <GuestHeader
      home={home}
      cafeName={menu.restaurantName}
      logoUrl={menu.logo ? dishPhotoUrl(menu.logo) : null}
      wordmarkUrl={
        menu.wordmarkBar ? dishPhotoUrl(menu.wordmarkBar) : menu.wordmark ? dishPhotoUrl(menu.wordmark) : null
      }
      tableLabel={table.kind === "ok" ? table.label : null}
      languages={languages}
      tools={view === "menu" ? tools : undefined}
      // The order view keeps the screen for the order: a short bar.
      compact={view === "cart" && lines.length > 0}
    />
  );
  const sender =
    canOrder && table.kind === "ok" && orderHref ? (
      <Suspense fallback={null}>
        <OrderSender
          summary={summary}
          locationId={menu.locationId}
          table={table}
          orderHref={orderHref}
          items={items}
          subs={subs}
          onRemoveDishes={removeDishes}
          onLocked={setLocked}
          onSoldOut={onSoldOut}
          onPlaced={clearCart}
        />
      </Suspense>
    ) : null;

  const dockItems: DockItem[] =
    table.kind === "ok"
      ? [
          {
            key: "menu",
            label: t("nav.menu"),
            icon: <UtensilsCrossed size={24} aria-hidden />,
            current: view === "menu",
            onClick: () => (view === "cart" ? closeCart() : window.scrollTo({ top: 0, behavior: smooth() })),
          },
          lines.length > 0 || !orderHref
            ? {
                key: "order",
                label: t("nav.order"),
                ariaLabel: orderLabel,
                icon: <ShoppingBag size={24} aria-hidden />,
                badge: count,
                current: view === "cart",
                disabled: lines.length === 0,
                onClick: () => (view === "cart" ? window.scrollTo({ top: 0, behavior: smooth() }) : openCart()),
              }
            : {
                key: "order",
                label: t("nav.order"),
                icon: <ShoppingBag size={24} aria-hidden />,
                href: orderHref,
              },
          ...(canOrder
            ? [
                {
                  key: "waiter",
                  label: t("nav.waiter"),
                  icon: <ConciergeBell size={24} aria-hidden />,
                  expanded: waiter.state === "confirm" || waiter.state === "sending",
                  onClick: waiter.ask,
                  testId: "call-waiter-nav",
                },
              ]
            : []),
        ]
      : [];

  const waiterPrompt = canOrder && table.kind === "ok" && (askedBefore || leftUnsent) && (
    <Suspense fallback={null}>
      <CallWaiterPrompt token={table.token} tableId={table.id} />
    </Suspense>
  );
  const suggestions = (autoHide: boolean) =>
    canOrder &&
    suggest &&
    lines.length > 0 && (
      <Suspense fallback={null}>
        <Suggestions
          locationId={menu.locationId}
          trigger={suggest}
          cartIds={lines.map((l) => l.itemId)}
          items={items}
          soldOut={soldOutNow}
          track={track}
          onAdd={(item, from) => quickAdd(item, from, 1, "suggest")}
          onChoose={setSheet}
          autoHide={autoHide}
        />
      </Suspense>
    );

  if (view === "cart" && lines.length > 0) {
    return (
      <>
        {header}
        <Suspense fallback={null}>
          <CartView
            summary={summary}
            items={items}
            ambiguous={ambiguous}
            locked={locked}
            notice={
              orderingNotice ?? (summary.blocked ? <Notice tone="alert">{t("cart.soldOut")}</Notice> : null)
            }
            footer={sender}
            wait={menu.kitchenBusy ? null : hints.wait}
            onQuantity={(id, quantity) => {
              // removing the last line returns to the menu (screens.md)
              if (changeQuantity(id, quantity).length === 0) closeCart();
            }}
            onBack={closeCart}
          />
        </Suspense>
        {/* The tabs stay on the order view too: back to the menu, and the waiter. */}
        <GuestDock items={dockItems} above={waiterPrompt} />
      </>
    );
  }

  // One 48 px filled pill (benchmark §2.1: Wolt): the magnifier, the field at
  // 16 px, its own clear ×, and the filters as a 44 px icon inside the right
  // end, with a dot while one is on. No border box, one focus ring.
  const searchRow = (
    <div className="bg-chip relative flex min-h-12 min-w-[min(100%,14rem)] items-center rounded-full focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--guest-accent-text)]">
      <label className="sr-only" htmlFor="menu-search">
        {t("menu.search")}
      </label>
      <Search size={18} aria-hidden className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2" />
      <input
        ref={search}
        id="menu-search"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!fold) void import("@/lib/format/search").then((m) => setFold(() => m.normalizeForSearch));
        }}
        placeholder={t("menu.searchPlaceholder")}
        autoComplete="off"
        enterKeyHint="search"
        className="placeholder:text-muted min-h-12 w-full min-w-0 flex-1 rounded-full bg-transparent pr-2 pl-11 text-base outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {query && (
        <button
          type="button"
          aria-label={t("menu.clearSearch")}
          onClick={() => {
            setQuery("");
            search.current?.focus();
          }}
          className="text-muted hover:text-ink grid size-11 flex-none place-items-center rounded-full [&_svg]:size-[18px]"
        >
          <CloseIcon />
        </button>
      )}
      {offerFilter && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-pressed={filterCount > 0}
          aria-label={filterCount ? t("diet.openCount", { count: filterCount }) : t("diet.open")}
          title={t("diet.open")}
          onClick={() => setChoosingAvoid(true)}
          data-testid="allergy-filter"
          className="text-ink hover:bg-page relative mr-0.5 grid size-11 flex-none place-items-center rounded-full"
        >
          <SlidersHorizontal size={20} />
          {filterCount > 0 && (
            <span
              aria-hidden="true"
              className="bg-badge absolute top-2 right-2 size-2.5 rounded-full ring-2 ring-[var(--guest-chip)]"
            />
          )}
        </button>
      )}
    </div>
  );
  // No table: the menu says how to order, in the line under the café's name.
  const scanNote =
    table.kind === "none" && menu.ordering ? (
      <span
        className="text-muted flex min-h-11 min-w-0 flex-1 basis-[20rem] items-center gap-2 py-1 text-label leading-[1.35]"
        data-testid="scan-note"
      >
        <QrCode size={20} strokeWidth={1.75} className="flex-none" />
        <span className="min-w-0">{t("menu.noTable")}</span>
      </span>
    ) : null;
  return (
    <>
      <MenuBar
        cafeName={menu.restaurantName}
        logoUrl={menu.logo ? dishPhotoUrl(menu.logo) : null}
        wordmarkUrl={
          menu.wordmarkBar
            ? dishPhotoUrl(menu.wordmarkBar)
            : menu.wordmark
              ? dishPhotoUrl(menu.wordmark)
              : null
        }
        home={home}
        tableLabel={table.kind === "ok" ? table.label : null}
        note={scanNote}
        languages={languages}
        nav={<CategoryNav categories={shown} />}
        tools={tools}
        search={searchRow}
      />
      <div className={`${COLUMN} flex-1 ${lines.length > 0 ? DOCK_SPACE_TALL : DOCK_SPACE} lg:pb-24`}>
        <div className={THREE_UP}>
          <div className="lg:col-start-2">
            {((menu.promos.length > 0 && !query) || orderingNotice || menu.kitchenBusy) && (
              <div className="grid gap-2 pt-4">
                {!query && promoBanners}
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
            {avoid.length > 0 && (
              <p className="text-muted pb-1 text-body" role="status">
                {t("diet.active", { list: allergenList(avoid) })} {t("diet.tellWaiter")}
              </p>
            )}
            {diet.length > 0 && (
              <p className="text-muted flex flex-wrap items-center gap-x-3 pb-1 text-body" role="status">
                <span>{t("diet.activeTags", { list: diet.map((f) => t(`diet.chip.${f}`)).join(", ") })}</span>
                <button
                  type="button"
                  onClick={() => setDiet([])}
                  className="min-h-11 font-semibold underline"
                >
                  {t("diet.showAll")}
                </button>
              </p>
            )}
          </div>
        </div>
        <div className={THREE_UP}>
          <SectionList categories={shown} stick={SIDE_TOP} />
          <main className="min-w-0">
            {shown.length === 0 ? (
              // One headline, one sentence, one way out (benchmark §2.3 empty states).
              <div className="grid justify-items-start gap-2 py-10" role="status">
                <p className="text-heading font-semibold">{t("menu.noResultsTitle")}</p>
                <p className="text-muted text-body">{t("menu.noResultsHint")}</p>
                {(query || diet.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setDiet([]);
                      search.current?.focus();
                    }}
                    className="border-line-strong hover:bg-chip mt-2 inline-flex min-h-12 items-center rounded-full border px-5 text-body font-semibold"
                  >
                    {t("menu.clearSearch")}
                  </button>
                )}
              </div>
            ) : (
              // One compact page: the four clusters (food, desserts, drinks, wine) one
              // after another, each with its sections and their dishes as small cards.
              // No cover photos and no big titles, so nothing jumps while scrolling.
              (() => {
                const clusters = groupSections(shown);
                // In a longer section the first pictured dish leads as a large card
                // on a phone, so the list of rows changes pace (design merge from A).
                // The pictured dishes come first as photo cards (two across, three
                // from 1280 px), then the dishes without a photo as a compact list
                // of text cards, so one grid never mixes a tall photo card with a
                // short text one. Within each, the café's own order stays.
                const rows = (list: GuestItem[]) => {
                  const lead = list.length >= 3 ? list.find((i) => i.image && !i.soldOut)?.id : undefined;
                  const pictured = list.filter((i) => i.image);
                  const plain = list.filter((i) => !i.image);
                  pictured.sort((a, b) => Number(b.id === lead) - Number(a.id === lead));
                  const card = (item: GuestItem, i: number) => (
                    <DishRow
                      key={item.id}
                      item={item}
                      canOrder={canOrder}
                      preview={table.kind === "none" && menu.ordering}
                      warning={warningFor(item)}
                      index={i}
                      feature={item.id === lead}
                      inCart={inCart[item.id] ?? 0}
                      onOpen={setSheet}
                      onQuickAdd={quickAdd}
                      onDecrease={decrease}
                    />
                  );
                  return (
                    <>
                      {pictured.length > 0 && (
                        <ul className="grid gap-3 md:grid-cols-2">{pictured.map(card)}</ul>
                      )}
                      {plain.length > 0 && (
                        <ul className={`grid gap-3 md:grid-cols-2 ${pictured.length > 0 ? "mt-3" : ""}`}>
                          {plain.map((item, i) => card(item, pictured.length + i))}
                        </ul>
                      )}
                    </>
                  );
                };
                return clusters.map(({ group, sections }) => (
                  <div key={group} id={`group-${group}`} className="scroll-mt-2 pt-5" data-group={group}>
                    {clusters.length > 1 &&
                      !(
                        sections.length === 1 &&
                        sections[0]!.name?.text.trim().toLocaleLowerCase() ===
                          t(`menu.groups.${group}`).trim().toLocaleLowerCase()
                      ) && (
                      <h2 className="display-face text-title text-[1.25rem] leading-[1.2]">
                        {t(`menu.groups.${group}`)}
                      </h2>
                    )}
                    {sections.map((c) => (
                      <section
                        key={c.id}
                        id={sectionId(c.id)}
                        aria-labelledby={`h-${c.id}`}
                        className="scroll-mt-2 pt-4"
                      >
                        {c.name && (
                          <h3
                            id={`h-${c.id}`}
                            lang={c.name.lang === locale ? undefined : c.name.lang}
                            className="text-ink mb-3 flex items-baseline gap-2 text-name leading-[1.25] font-semibold"
                          >
                            {c.name.text}
                            <span className="num text-soft text-label font-normal">{c.items.length}</span>
                          </h3>
                        )}
                        {rows(c.items)}
                      </section>
                    ))}
                  </div>
                ));
              })()
            )}
          </main>
          <div className="hidden pt-5 lg:block">
            <div className={`sticky ${SIDE_TOP}`}>
              {/* Only where the rail is on screen: a phone sends from the order view. */}
              {wide && (
                <Suspense fallback={null}>
                  <OrderRail
                    summary={summary}
                    items={items}
                    ambiguous={ambiguous}
                    locked={locked}
                    onQuantity={changeQuantity}
                    onOpen={openCart}
                    send={summary.blocked ? null : sender}
                    ideas={suggestions(false)}
                    below={
                      table.kind === "ok" && (canOrder || orderHref) ? (
                        <>
                          {canOrder && (
                            <button
                              type="button"
                              aria-expanded={waiter.state === "confirm" || waiter.state === "sending"}
                              onClick={waiter.ask}
                              data-testid="call-waiter-rail"
                              className={railAction}
                            >
                              <ConciergeBell size={20} aria-hidden />
                              {t("nav.waiter")}
                            </button>
                          )}
                          {orderHref && (
                            <a href={orderHref} className={railAction}>
                              <CheckIcon />
                              {t("panel.sent")}
                            </a>
                          )}
                        </>
                      ) : null
                    }
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </div>
      <GuestDock
        items={dockItems}
        above={
          <>
            {waiterPrompt}
            {!wide && suggestions(true)}
            {lines.length > 0 && (
              <div className="lg:hidden">
                <CartBar summary={summary} items={items} onOpen={openCart} />
              </div>
            )}
          </>
        }
      />
      {openDish && (
        <Suspense fallback={null}>
          <DishSheet
            key={openDish.id}
            item={openDish}
            canOrder={canOrder}
            track={track}
            onClose={() => setSheet(null)}
            onAdd={(a) => {
              gate(openDish, () => add(openDish, a));
              setSheet(null);
            }}
          />
        </Suspense>
      )}
      {ask && (
        <Suspense fallback={null}>
          <SubsDialog
            mode="add"
            entries={[ask.entry]}
            onAccept={() => {
              void loadSubs().then((m) => m.accept(menu.locationId, [ask.entry.sub]));
              ask.run();
              setAsk(null);
            }}
            onDecline={() => setAsk(null)}
          />
        </Suspense>
      )}
      {choosingAvoid && (
        <Suspense fallback={null}>
          <AllergenFilter
            avoid={avoid}
            onChange={setAvoid}
            diet={diet}
            onDiet={setDiet}
            onClose={() => setChoosingAvoid(false)}
          />
        </Suspense>
      )}
      {/* The add itself is the feedback: the dish flies to the order, the row's
          "+" turns into its count and the cart bar's total moves. Screen
          readers hear it here. */}
      <p className="sr-only" role="status" aria-live="polite">
        {toast?.text}
      </p>
    </>
  );
}
