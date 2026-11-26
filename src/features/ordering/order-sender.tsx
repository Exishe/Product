"use client";

import { useRouter } from "next/navigation";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import styles from "@/features/menu/guest-menu/guest.module.css";
import type { SubAsk } from "@/features/menu/guest-menu/subs-dialog";
import type { GuestItem } from "@/features/menu/guest-menu/view-model";
import type { Locale } from "@/i18n/routing";
import { toOrderLines, type CartLine, type CartSummary } from "./cart";
import { useGuestI18n } from "./guest-i18n-context";
import type { OrderErrorKind } from "./order-errors";
import { saveLastOrder } from "./last-order";
import { beginPending, clearPending, loadPending } from "./pending-order";
import type { SubInfo } from "./substitutions-parse";

// The bookkeeping for substitutions loads with the first dish that has one (or when an order is refused for one).
const loadSubs = () => import("./substitutions");

// The "made with X instead of Y, OK?" pop-up (ADR-076) is fetched only when it is first needed.
const SubsDialog = lazy(() => import("@/features/menu/guest-menu/subs-dialog").then((m) => ({ default: m.SubsDialog })));

type Phase =
  { name: "idle" } | { name: "sending" } | { name: "offline" } | { name: "error"; why: OrderErrorKind };

const RETRY_MS = 10_000;
const loadSender = () => import("./place-order");

// The send area of the cart. Pressing the button saves the idempotency key
// with the exact request first, then sends. With no answer the cart stays
// locked to that request and is retried with the same key: by the button,
// when the phone comes back online, every 10 s, and after a reload.
export function OrderSender({
  summary,
  locationId,
  table,
  orderHref,
  items,
  subs,
  onRemoveDishes,
  onLocked,
  onSoldOut,
  onPlaced,
}: {
  summary: CartSummary;
  locationId: string;
  table: { id: string; token: string };
  orderHref: string;
  /** The menu's dishes (names and prices for the pop-up). */
  items: Record<string, GuestItem>;
  /** The dishes made with a replacement today, by dish id. */
  subs: Record<string, SubInfo>;
  /** The guest chose not to have these dishes after all. */
  onRemoveDishes: (itemIds: string[]) => void;
  onLocked: (locked: boolean) => void;
  onSoldOut: (itemId: string) => void;
  onPlaced: () => void;
}) {
  const { t, locale } = useGuestI18n();
  const router = useRouter();
  const scope = { locationId, tableId: table.id };
  // Rendered only in the browser (the cart view opens after hydration).
  const [phase, setPhase] = useState<Phase>(() =>
    loadPending(window.localStorage, scope) ? { name: "sending" } : { name: "idle" },
  );
  const busy = useRef(false);
  const placed = useRef(false);
  // The lines this press sent, remembered as "last time here" once placed.
  const sent = useRef<CartLine[]>([]);
  // Substitutions the server named when it refused an order (newer than the menu on screen).
  const [serverSubs, setServerSubs] = useState<Record<string, SubInfo>>({});
  const [asking, setAsking] = useState<SubAsk[] | null>(null);
  const allSubs = { ...subs, ...serverSubs };

  const send = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase({ name: "sending" });
    onLocked(true);
    try {
      const { placeOrder } = await loadSender();
      const result = await placeOrder({
        token: table.token,
        tableId: table.id,
        locationId,
        locale: locale as Locale,
      });
      if (result.kind === "placed" || result.kind === "already_sent") {
        clearPending(window.localStorage, { locationId, tableId: table.id });
        saveLastOrder(window.localStorage, locationId, sent.current);
        placed.current = true;
        router.push(orderHref);
        return;
      }
      if (result.kind === "offline") {
        setPhase({ name: "offline" });
        return;
      }
      // A definite "no": nothing was created, so the guest may change the cart.
      clearPending(window.localStorage, { locationId, tableId: table.id });
      onLocked(false);
      if (result.kind === "sold_out" && result.itemId) onSoldOut(result.itemId);
      if (result.kind === "substitution_changed") {
        // A replacement started after the guest added the dish: ask about exactly those dishes, once.
        const asked = (await loadSubs()).refusal(result.details, locale, items);
        if (asked) {
          setServerSubs((prev) => ({ ...prev, ...asked.subs }));
          setAsking(asked.asks);
          setPhase({ name: "idle" });
          return;
        }
      }
      setPhase({ name: "error", why: result });
    } catch {
      setPhase({ name: "offline" }); // the sending code itself didn't load
    } finally {
      busy.current = false;
    }
  }, [locationId, table.id, table.token, locale, orderHref, router, items, onLocked, onSoldOut]);

  // An order left unsent (no answer, then a reload): try it again at once.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || phase.name !== "sending") return;
    resumed.current = true;
    void loadSender(); // warm up
    void send();
  }, [phase.name, send]);

  useEffect(() => {
    void loadSender(); // fetch the sending code while the guest reads the cart
  }, []);

  useEffect(() => {
    if (phase.name !== "offline") return;
    const retry = () => void send();
    window.addEventListener("online", retry);
    const timer = setInterval(retry, RETRY_MS);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(timer);
    };
  }, [phase.name, send]);

  // The cart is emptied once the status page has replaced the menu.
  useEffect(
    () => () => {
      if (placed.current) onPlaced();
    },
    [onPlaced],
  );

  const begin = (ack: string[]) => {
    const lines = summary.lines.map((p) => p.line);
    sent.current = lines;
    beginPending(window.localStorage, scope, toOrderLines(lines), undefined, ack);
    void send();
  };
  const start = () => {
    // A dish with a replacement the guest has not accepted yet is asked about first.
    if (Object.keys(allSubs).length === 0) return begin([]);
    void loadSubs().then((m) => {
      const { ask, ack } = m.plan(locationId, summary.lines.map((p) => p.line), allSubs, items);
      if (ask.length > 0) setAsking(ask);
      else begin(ack);
    });
  };

  const message =
    phase.name === "offline"
      ? t("cart.offline")
      : phase.name === "error"
        ? ({
            sold_out: t("cart.soldOut"),
            menu_changed: t("cart.menuChanged"),
            substitution_changed: t("cart.menuChanged"), // the menu reloads with the note; the asking screen comes with the pop-up
            rate_limited: t("cart.rateLimited"),
            ordering_off: t("menu.orderingOff"),
            paused: t("menu.paused"),
            closed: t("menu.closedToday"),
          }[phase.why.kind as string] ?? t("cart.failed"))
        : null;

  const dialog = asking && (
    <Suspense fallback={null}>
      <SubsDialog
        mode="send"
        entries={asking}
        onAccept={() => {
          setAsking(null);
          void loadSubs().then((m) => {
            m.accept(locationId, asking.map((e) => e.sub));
            begin(m.plan(locationId, summary.lines.map((p) => p.line), allSubs, items).ack);
          });
        }}
        onDecline={() => {
          onRemoveDishes(asking.map((e) => e.sub.itemId));
          setAsking(null);
        }}
      />
    </Suspense>
  );
  const primary = `${styles.cta} flex min-h-12 w-full items-center justify-center rounded-[16px] px-6 text-body font-semibold`;
  return (
    <div className="grid gap-3">
      {dialog}
      <p
        role="status"
        aria-live="polite"
        className={message ? "rounded-card border-alert bg-alert-tint border px-4 py-3" : "sr-only"}
      >
        {message}
      </p>
      {phase.name === "error" && (phase.why.kind === "menu_changed" || phase.why.kind === "substitution_changed") ? (
        <button type="button" className={primary} onClick={() => window.location.reload()}>
          {t("cart.reload")}
        </button>
      ) : phase.name === "offline" ? (
        <button type="button" className={primary} onClick={() => void send()}>
          {t("cart.retry")}
        </button>
      ) : (
        // The page's one main action: a plain pill, with one sweep of light
        // round its edge as the order screen opens (ready to send).
        <button
          type="button"
          className={`${primary} ${styles.ready}`}
          disabled={phase.name === "sending" || summary.blocked || summary.count === 0}
          onClick={start}
        >
          {phase.name === "sending" ? t("cart.sending") : t("cart.send")}
        </button>
      )}
    </div>
  );
}
