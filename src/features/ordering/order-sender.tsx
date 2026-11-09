"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { toOrderLines, type CartSummary } from "./cart";
import { useGuestI18n } from "./guest-i18n-context";
import type { OrderErrorKind } from "./order-errors";
import { beginPending, clearPending, loadPending } from "./pending-order";

type Phase = { name: "idle" } | { name: "sending" } | { name: "offline" } | { name: "error"; why: OrderErrorKind };

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
  onLocked,
  onSoldOut,
  onPlaced,
}: {
  summary: CartSummary;
  locationId: string;
  table: { id: string; token: string };
  orderHref: string;
  onLocked: (locked: boolean) => void;
  onSoldOut: (itemId: string) => void;
  onPlaced: () => void;
}) {
  const { t, locale } = useGuestI18n();
  const router = useRouter();
  const scope = { locationId, tableId: table.id };
  // Rendered only in the browser (the cart view opens after hydration).
  const [phase, setPhase] = useState<Phase>(() => (loadPending(window.localStorage, scope) ? { name: "sending" } : { name: "idle" }));
  const busy = useRef(false);
  const placed = useRef(false);

  const send = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase({ name: "sending" });
    onLocked(true);
    try {
      const { placeOrder } = await loadSender();
      const result = await placeOrder({ token: table.token, tableId: table.id, locationId, locale: locale as Locale });
      if (result.kind === "placed" || result.kind === "already_sent") {
        clearPending(window.localStorage, { locationId, tableId: table.id });
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
      setPhase({ name: "error", why: result });
    } catch {
      setPhase({ name: "offline" }); // the sending code itself didn't load
    } finally {
      busy.current = false;
    }
  }, [locationId, table.id, table.token, locale, orderHref, router, onLocked, onSoldOut]);

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

  const start = () => {
    beginPending(window.localStorage, scope, toOrderLines(summary.lines.map((p) => p.line)));
    void send();
  };

  const message =
    phase.name === "offline"
      ? t("cart.offline")
      : phase.name === "error"
        ? {
            sold_out: t("cart.soldOut"),
            menu_changed: t("cart.menuChanged"),
            rate_limited: t("cart.rateLimited"),
            ordering_off: t("menu.orderingOff"),
          }[phase.why.kind as string] ?? t("cart.failed")
        : null;

  const primary =
    "flex min-h-14 w-full items-center justify-center rounded-sheet bg-apricot px-4 font-semibold text-ink disabled:bg-mist disabled:text-muted";
  return (
    <div className="grid gap-3">
      <p role="status" aria-live="polite" className={message ? "rounded-sheet border border-pomegranate bg-pom-tint px-4 py-3" : "sr-only"}>
        {message}
      </p>
      {phase.name === "error" && phase.why.kind === "menu_changed" ? (
        <button type="button" className={primary} onClick={() => window.location.reload()}>
          {t("cart.reload")}
        </button>
      ) : phase.name === "offline" ? (
        <button type="button" className={primary} onClick={() => void send()}>
          {t("cart.retry")}
        </button>
      ) : (
        <button type="button" className={primary} disabled={phase.name === "sending" || summary.blocked || summary.count === 0} onClick={start}>
          {phase.name === "sending" ? t("cart.sending") : t("cart.send")}
        </button>
      )}
    </div>
  );
}
