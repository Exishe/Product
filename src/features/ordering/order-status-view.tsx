"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { warmMotion } from "@/features/guest-theme/motion/motion";
import motionStyles from "@/features/guest-theme/motion/motion.module.css";
import { useReveal } from "@/features/guest-theme/motion/reveal";
import { sparkFrom } from "@/features/guest-theme/motion/spark";
import { waitState, type WaitRange } from "@/features/menu/guest-menu/hints";
import { localized } from "@/features/menu/guest-menu/view-model";
import guestStyles from "@/features/menu/guest-menu/guest.module.css";
import { CheckIcon, MinusIcon, Notice, PlusIcon, STEP, Txt } from "@/features/menu/guest-menu/ui";
import { DishOrbit, type OrbitDish } from "./dish-orbit";
import type { Locale } from "@/i18n/routing";
import { formatTime } from "@/lib/format/date";
import { formatAmd } from "@/lib/format/money";
import { useGuestChannel } from "@/lib/realtime/use-guest-channel";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { Database } from "@/lib/supabase/database";
import { OPEN_CART_KEY, addToCart, cartKey } from "./cart-store";
import { substituteOf } from "./substitutions-parse";
import { MAX_PEOPLE, repeatLines, shareOf } from "./repeat";
import { useGuestI18n } from "./guest-i18n-context";
import { loadGuestSession, saveGuestSession } from "./guest-session";
import { classifyOrderError } from "./order-errors";
import { beginRequest, clearRequest, loadRequest, RETRY_MS, type PendingRequest } from "./pending-request";
import { NotifyReady } from "./notify-ready";
import {
  answeredSince,
  nextExpiry,
  serviceLines,
  type ServiceKind,
  type ServiceRequest,
} from "./service-status";
import type { Dishes } from "./cant-make";
import { GamesCorner } from "@/features/games/games-corner";
import { DOCK_SPACE, DOCK_SPACE_TALL, GuestDock, type DockItem } from "@/features/menu/guest-menu/guest-dock";
import { ChevronRight, ConciergeBell, Gamepad2, ReceiptText, RotateCcw, UtensilsCrossed } from "lucide-react";
import { useCallWaiter } from "@/features/menu/guest-menu/call-waiter-state";
import {
  displayStatus,
  isActive,
  STEPS,
  type DisplayStatus,
  type OrderState,
} from "./order-status";

// Only fetched when the kitchen could not make a dish (ADR-081).
const CantMakeNote = dynamic(() => import("./cant-make").then((m) => m.CantMakeNote), { ssr: false });
// The menu's waiter choices, for a table with no order from this phone yet.
const CallWaiterPrompt = dynamic(
  () => import("@/features/menu/guest-menu/call-waiter-button").then((m) => m.CallWaiterPrompt),
  { ssr: false },
);

type Db = SupabaseClient<Database>;
type Names = Record<string, string | null> | null;
type Line = {
  id: string;
  item_id: string | null;
  name_i18n: Names;
  quantity: number;
  cancelled_quantity: number;
  line_total: number;
  note: string | null;
  sort: number;
  order_item_modifiers: { name_i18n: Names; modifier_id: string | null }[];
  /** ADR-076: {from, to, price_delta} when an ingredient was replaced; absent before that migration. */
  substitution?: unknown;
  /** ADR-081: when the kitchen could not make it; absent before that migration. */
  cant_make_at?: string | null;
};
type Order = OrderState & {
  id: string;
  location_id: string;
  number: number;
  total: number;
  placed_at: string;
  reject_reason: string | null;
  order_items: Line[];
};
type Request = ServiceRequest;
type Data = { orders: Order[]; requests: Request[]; closed: boolean };

// The stages before "ready": the only time «Notify me when it's ready» makes sense.
const waiting = new Set<DisplayStatus>(["received", "accepted", "cooking"]);

const ORDER_COLUMNS =
  "id, location_id, number, status, kitchen_status, paid_at, total, placed_at, reject_reason, possible_duplicate_of, " +
  "order_items(*, order_item_modifiers(name_i18n, modifier_id))";

// The guest session of this phone at this table: remembered from ordering,
// or (another tab, cleared storage) the newest one RLS lets this user read.
async function findGuestSession(db: Db, tableId: string): Promise<string | null> {
  const { data } = await db.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return null;
  const remembered = loadGuestSession(window.localStorage, tableId, userId);
  if (remembered) return remembered;
  const { data: rows } = await db
    .from("guest_sessions")
    .select("id")
    .eq("table_id", tableId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const id = rows?.[0]?.id ?? null;
  if (id) saveGuestSession(window.localStorage, tableId, userId, id);
  return id;
}

// The table's open requests and the ones answered a moment ago («Գնում եմ»),
// also those another phone at the table started (ADR-090). Before that
// migration is applied: this guest's own rows, as before.
async function loadRequests(db: Db, guestSessionId: string) {
  const viaTable = await db.schema("api").rpc("guest_service_status", { p_guest_session_id: guestSessionId });
  if (viaTable.error?.code !== "PGRST202") return viaTable;
  return db
    .from("service_requests")
    .select("id, kind, status, resolved_at")
    .eq("guest_session_id", guestSessionId)
    .or(`status.neq.resolved,resolved_at.gte.${answeredSince(Date.now())}`);
}

async function load(db: Db, guestSessionId: string): Promise<Data | null> {
  const [orders, requests, session] = await Promise.all([
    db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("guest_session_id", guestSessionId)
      .order("placed_at", { ascending: false }),
    loadRequests(db, guestSessionId),
    db.from("guest_sessions").select("revoked_at, expires_at").eq("id", guestSessionId).maybeSingle(),
  ]);
  if (orders.error || requests.error || session.error) return null;
  const s = session.data;
  return {
    orders: orders.data as unknown as Order[],
    requests: requests.data as Request[],
    closed: !s || s.revoked_at !== null || new Date(s.expires_at) <= new Date(),
  };
}

// The progress bar (ADR-093 area pass, benchmark §2.3: Uber Eats): four
// segments, 4 px tall and 4 px apart (received and accepted share the first),
// under the 28 px headline that names the state. Done segments fill from the left one after
// another (ms apart) on first view; the current one breathes while the
// kitchen works. Under it the current step's note at 16 px.
const BEAT = 450;
const SEGMENTS = ["accepted", "cooking", "ready", "served"] as const;
const SEGMENT_OF: Record<DisplayStatus, number> = {
  received: 0,
  accepted: 1,
  cooking: 1,
  ready: 2,
  served: 3,
  paid: 3,
  rejected: 0,
  cancelled: 0,
};

function Tracker({ order, status }: { order: Order; status: DisplayStatus }) {
  const { t } = useGuestI18n();
  const now = SEGMENT_OF[status];
  const finished = status === "served" || status === "paid";
  // After the first sequence, changes play without the wait.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), BEAT * (STEPS.length + 1));
    return () => clearTimeout(timer);
  }, []);
  const note =
    status === "received"
      ? order.possible_duplicate_of
        ? t("order.notes.duplicate")
        : order.status === "placed"
          ? t("order.notes.waiting")
          : t("order.notes.received")
      : t(`order.notes.${status}`);
  return (
    <div className="grid gap-3" data-testid="tracker">
      <ol className="grid grid-cols-4 gap-1">
        {SEGMENTS.map((step, i) => {
          const done = i < now || finished;
          const current = i === now && !finished;
          const here = i === now;
          const fillAt = { "--d": `${settled ? 0 : i * BEAT}ms` } as CSSProperties;
          return (
            <li key={step} className="min-w-0" aria-current={here ? "step" : undefined}>
              <span aria-hidden="true" className="bg-line relative block h-1 overflow-hidden rounded-full">
                <span
                  className={guestStyles.segFill}
                  data-on={done || current}
                  data-now={current || undefined}
                  style={fillAt}
                />
              </span>
              <span
                // The 28 px headline says the state (as Uber's bar does); the four
                // labels would break mid-word in narrow columns, so they are for
                // screen readers, with the current step marked.
                className={`sr-only ${
                  here ? "text-ink font-semibold" : done ? "text-ink" : "text-muted"
                }`}
              >
                {t(`order.steps.${status === "received" && i === 0 ? "received" : step}`)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-body leading-[1.45]">{note}</p>
    </div>
  );
}

// "Usually ready in 10–15 min" from the café's own rounds (ADR-060), and,
// well past that, a calm "taking longer than usual" with the waiter as the
// way out. Re-checked every 30 seconds; never a countdown.
function WaitLine({ wait, placedAt }: { wait: WaitRange; placedAt: string }) {
  const { t } = useGuestI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const late = waitState(wait, placedAt, now) === "late";
  return (
    <p className="text-muted text-body" data-testid="order-wait" data-late={late}>
      {late ? t("wait.late") : t(wait.low === wait.high ? "wait.usualOne" : "wait.usual", wait)}
    </p>
  );
}

// Pieces of the order page that rise into view as the guest scrolls to them
// (the games at the bottom): the same entrance the menu's cards use.
function Rise({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref);
  return (
    <div ref={ref} className={motionStyles.reveal}>
      {children}
    </div>
  );
}

// «Recommended for you» under the order: the dishes the café's own rounds pair
// with what this table ordered (ADR-060), then the menu's best-looking dishes,
// turning on an orbit so the page is never an empty block.
function RecommendedCard({
  dishes,
  menuHref,
  ordered,
  pairs,
  onAdd,
}: {
  dishes: OrbitDish[];
  menuHref: string;
  ordered: string[];
  pairs: Record<string, string[]>;
  onAdd?: (itemId: string) => void;
}) {
  const { t } = useGuestI18n();
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const skip = new Set(ordered);
  const first = ordered
    .flatMap((id) => pairs[id] ?? [])
    .flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  const all = [
    ...new Map([...first, ...dishes].filter((d) => !skip.has(d.id)).map((d) => [d.id, d])).values(),
  ];
  // Plates with a photo only, when there are enough of them; an orbit of empty plates says nothing.
  const photos = all.filter((d) => d.image);
  const list = (photos.length >= 4 ? photos : all).slice(0, 9);
  if (list.length < 3) return null;
  return (
    // Part of the page, not a card on it: the page colour, the menu's heading style.
    <section aria-labelledby="rec-title">
      <h2 id="rec-title" className="text-heading font-semibold">
        {t("order.recommended")}
      </h2>
      <div className="pt-2">
        <DishOrbit dishes={list} menuHref={menuHref} onAdd={onAdd} />
      </div>
    </section>
  );
}

function OrderCard({
  order,
  latest,
  part = "all",
  wait = null,
  details,
  onRepeat,
  cantMake,
}: {
  order: Order;
  latest: boolean;
  /** The newest order is shown in two places: its status on the right, its lines on the left. */
  part?: "all" | "lines" | "status";
  details?: Record<string, string>;
  /** Alternatives for a dish the kitchen could not make (ADR-081). */
  cantMake?: { db: Db | null; dishes: Dishes | undefined; onAdd?: (order: Order, itemId: string) => void };
  wait?: WaitRange | null;
  /** "Order the same again": back to the menu with these dishes in the cart. */
  onRepeat?: (order: Order) => void;
}) {
  const { t, locale } = useGuestI18n();
  const status = displayStatus(order);
  const lines = [...order.order_items].sort((a, b) => a.sort - b.sort);
  const Title = latest ? "h2" : "h3";
  const statusBlock =
    status === "rejected" ? (
      <div className="my-4 grid gap-1">
        <Notice tone="alert">
          {t("order.rejected")}
          {order.reject_reason ? ` ${t("order.reason", { reason: order.reject_reason })}` : null}
        </Notice>
      </div>
    ) : status === "cancelled" ? (
      <div className="my-4">
        <Notice tone="alert">{t("order.cancelled")}</Notice>
      </div>
    ) : latest ? (
      <>
        <Tracker order={order} status={status} />
        {wait && waiting.has(status) && <WaitLine wait={wait} placedAt={order.placed_at} />}
      </>
    ) : null;
  if (part === "status")
    return (
      // One status block on the page's edge (ADR-093 area pass): the state at
      // 28 px, when it was sent, the progress bar and the wait. No box.
      <section aria-label={t("order.title", { number: order.number })} data-status={status} className="grid gap-1">
        {status !== "rejected" && status !== "cancelled" && (
          <h2 className="display-face text-large leading-[1.15] font-semibold" data-testid="order-phase">
            {t(`order.steps.${status}`)}
          </h2>
        )}
        <p className="text-muted text-label">
          {t("order.title", { number: order.number })} ·{" "}
          <span className="whitespace-nowrap">
            {t("order.placedAt", { time: formatTime(new Date(order.placed_at)) })}
          </span>
        </p>
        <div className="mt-3 grid gap-3">{statusBlock}</div>
      </section>
    );
  return (
    <article
      className={latest ? "border-line border-t pt-4 lg:border-t-0 lg:pt-0" : "border-line border-t pt-4"}
      data-testid="order"
      data-order-number={order.number}
      data-status={status}
    >
      <div className="flex items-baseline justify-between gap-3">
        <Title className={`display-face leading-[1.2] ${latest ? "text-heading" : "text-name"}`}>
          {latest ? t("cart.title") : t("order.title", { number: order.number })}
        </Title>
        {!latest && (
          <span className="text-muted text-label font-semibold">
            {t(`order.steps.${status === "rejected" || status === "cancelled" ? "received" : status}`)}
          </span>
        )}
      </div>
      {!latest && (
        <p className="text-muted text-label">
          <span className="whitespace-nowrap">
            {t("order.placedAt", { time: formatTime(new Date(order.placed_at)) })}
          </span>
        </p>
      )}
      {part === "all" && statusBlock}
      <ul className="mt-2">
        {lines.map((l) => {
          const name = localized(l.name_i18n, locale as Locale);
          const left = l.quantity - l.cancelled_quantity;
          const mods = l.order_item_modifiers
            .map((m) => localized(m.name_i18n, locale as Locale))
            .filter((m) => m !== null);
          return (
            <li
              key={l.id}
              className="border-line grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b py-2.5 last:border-b-0"
            >
              <span
                className={`text-body leading-snug font-semibold [overflow-wrap:anywhere] ${left === 0 ? "text-muted line-through" : ""}`}
              >
                <span className="num">
                  {l.cancelled_quantity > 0 && left > 0 ? (
                    <s className="text-muted mr-1">{l.quantity}</s>
                  ) : null}
                  {left > 0 ? left : l.quantity}
                </span>
                {" × "}
                {name ? <Txt value={name} locale={locale as Locale} /> : null}
              </span>
              <span className="num text-right text-body font-semibold whitespace-nowrap">
                {left > 0 ? formatAmd(l.line_total, locale as Locale) : t("order.lineCancelled")}
              </span>
              {l.item_id && details?.[l.item_id] && (
                <span className="text-soft col-start-1 text-label break-words" data-testid="line-detail">
                  {details[l.item_id]}
                </span>
              )}
              {substituteOf(l.substitution, locale) && (
                <span className="text-muted col-start-1 text-body font-semibold" data-testid="line-sub">
                  {t("menu.withSub", { to: substituteOf(l.substitution, locale) ?? "" })}
                </span>
              )}
              {mods.length > 0 && (
                <span className="text-muted col-start-1 text-label">
                  {mods.map((m, i) => (
                    <span key={i}>
                      {i > 0 ? ", " : null}
                      <Txt value={m} locale={locale as Locale} />
                    </span>
                  ))}
                </span>
              )}
              {l.note && <span className="text-muted col-start-1 text-label break-words">{l.note}</span>}
              {l.cant_make_at && cantMake?.db && (
                <CantMakeNote
                  db={cantMake.db}
                  lineId={l.id}
                  dishes={cantMake.dishes}
                  onAdd={cantMake.onAdd ? (itemId) => cantMake.onAdd?.(order, itemId) : undefined}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-baseline justify-between py-4 text-name font-semibold">
        <span>{t("order.total")}</span>
        <span className="num">
          {formatAmd(status === "rejected" || status === "cancelled" ? 0 : order.total, locale as Locale)}
        </span>
      </div>
      {onRepeat && status !== "rejected" && status !== "cancelled" && repeatLines(order).length > 0 && (
        <p className={latest ? "-mt-1 pb-4" : "-mt-2 pb-2"}>
          <button
            type="button"
            onClick={() => onRepeat(order)}
            className="rounded-pill text-ink hover:bg-chip inline-flex min-h-11 items-center gap-2 border [border-color:var(--guest-line-strong)] px-4 text-label font-semibold"
          >
            <RotateCcw size={16} aria-hidden />
            {t("order.sameAgain")}
          </button>
        </p>
      )}
    </article>
  );
}

// The order status page: the guest's orders at this table (read through RLS),
// newest first, live over the guest's Realtime channel with a 10-second
// safety poll, plus "call the waiter" and "ask for the bill".
export function OrderStatusView({
  tableId,
  token = null,
  menuHref,
  vapidPublicKey = null,
  wait = null,
  details,
  dishes = [],
  pairs = {},
  cantMakeDishes,
}: {
  tableId: string;
  /** The table's QR token: the waiter's choices work before any order from this phone. */
  token?: string | null;
  menuHref: string;
  /** Dishes to recommend while the order cooks, best first (photos before none). */
  dishes?: OrbitDish[];
  /** The café's own "ordered together" pairs, by dish id (ADR-060). */
  pairs?: Record<string, string[]>;
  vapidPublicKey?: string | null;
  /** The café's usual wait (ADR-060); null when it can't say, or the kitchen set its own. */
  wait?: WaitRange | null;
  /** Descriptions of same-named dishes by dish id (view-model sameNameDetails). */
  details?: Record<string, string>;
  /** Name and price of every dish, by id: for the replacement dishes of ADR-081. */
  cantMakeDishes?: Dishes;
}) {
  const { t, locale } = useGuestI18n();
  const [db] = useState<Db | null>(() => (typeof window === "undefined" ? null : getBrowserClient()));
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "none">("loading");
  const [slow, setSlow] = useState(false);
  const [told, setTold] = useState<{ kind: "error" | "unsent"; key: number } | null>(null);
  // Just sent, not yet read back: bridges the moment before the next refresh.
  const [sentKinds, setSentKinds] = useState<ReadonlySet<ServiceKind>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const billButton = useRef<HTMLButtonElement>(null);
  const payPanel = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState<Request["kind"] | null>(null);
  const [choosing, setChoosing] = useState(false);
  // Requests with no answer yet: kept in storage, retried, never shown as sent.
  // Read in the browser only; requests left unsent before a reload come back here.
  const [unsent, setUnsent] = useState<PendingRequest[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return (["call_waiter", "bring_bill"] as const)
        .map((k) => loadRequest(window.localStorage, tableId, k))
        .filter((r): r is PendingRequest => r !== null);
    } catch {
      return [];
    }
  });
  const sending = useRef(false);
  const [people, setPeople] = useState(1);
  // The bottom bar's Waiter: two choices above the bar (call, or ask for the bill).
  const [waiterOpen, setWaiterOpen] = useState(false);
  const menuWaiter = useCallWaiter();
  const router = useRouter();

  useEffect(() => {
    if (!db) return;
    let gone = false;
    const timer = setTimeout(() => !gone && setSlow(true), 300);
    void (async () => {
      const id = await findGuestSession(db, tableId);
      if (gone) return;
      if (!id) {
        setPhase("none");
        return;
      }
      setGuestSessionId(id);
      const loaded = await load(db, id);
      if (gone) return;
      setData(loaded);
      setPhase("ready");
    })();
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [db, tableId]);

  const refresh = useCallback(() => {
    if (!db || !guestSessionId) return;
    void load(db, guestSessionId).then((loaded) => {
      if (!loaded) return;
      setData(loaded);
      setNow(Date.now());
      setSentKinds(new Set());
    });
  }, [db, guestSessionId]);

  const active = useMemo(
    () => (data ? data.orders.some(isActive) || data.requests.some((r) => r.status !== "resolved") : false),
    [data],
  );

  // A failed request's note leaves after a few seconds.
  useEffect(() => {
    if (told?.kind !== "error") return;
    const timer = setTimeout(() => setTold(null), 6000);
    return () => clearTimeout(timer);
  }, [told]);

  // The «waiter is on the way» line leaves by itself after a while.
  const requests = data?.requests;
  useEffect(() => {
    if (!requests) return;
    const at = nextExpiry(requests, Date.now());
    if (at === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, at - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [requests, now]);

  // The bill panel opens below the buttons, often under the fold: bring it in view.
  useEffect(() => {
    if (!choosing) return;
    payPanel.current?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [choosing]);

  // "Ready": a banner slides in, and if it became ready while the guest
  // watched, a big spark bursts from it.
  const top = data?.orders[0];
  const topStatus = top ? displayStatus(top) : null;
  const seen = useRef<DisplayStatus | null>(null);
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => warmMotion(), []);
  useEffect(() => {
    const was = seen.current;
    seen.current = topStatus;
    if (topStatus === "ready" && was !== null && was !== "ready") sparkFrom(banner.current, "big");
  }, [topStatus]);
  const channel = useGuestChannel({ supabase: db, guestSessionId, refresh, poll: active && !data?.closed });

  // One attempt at a saved request. The database keeps one open request per
  // table and kind, so a repeat after a lost answer never rings twice.
  const attemptSend = useCallback(
    async (req: PendingRequest): Promise<"sent" | "offline" | "failed"> => {
      if (!db || !guestSessionId) return "offline";
      const { error, status } = await db
        .schema("api")
        .rpc("guest_service_request", {
          p_guest_session_id: guestSessionId,
          p_kind: req.kind,
          ...(req.payment ? { p_payment_preference: req.payment } : {}),
        })
        .abortSignal(AbortSignal.timeout(15_000))
        .then(
          (r) => r,
          () => ({ error: { message: "network" }, status: 0 }),
        );
      const done = (r: "sent" | "failed") => {
        clearRequest(window.localStorage, tableId, req.kind);
        setUnsent((list) => list.filter((x) => x.kind !== req.kind));
        return r;
      };
      if (!error) return done("sent");
      return classifyOrderError({ status, error }).kind === "offline" ? "offline" : done("failed");
    },
    [db, guestSessionId, tableId],
  );

  const ask = async (kind: Request["kind"], payment?: "card" | "cash") => {
    if (!db || !guestSessionId) return;
    if (choosing) {
      setChoosing(false);
      // The panel with the focused button is going away: keep focus on the opener.
      billButton.current?.focus({ preventScroll: true });
    }
    setAsking(kind);
    let req: PendingRequest = { kind, payment: payment ?? null, createdAt: new Date().toISOString() };
    try {
      req = beginRequest(window.localStorage, tableId, kind, payment ?? null);
    } catch {
      // storage blocked: still send, just without the saved copy
    }
    const result = await attemptSend(req);
    setAsking(null);
    if (result === "offline") {
      setUnsent((list) => [...list.filter((x) => x.kind !== kind), req]);
      setTold({ kind: "unsent", key: Date.now() });
      return;
    }
    if (result === "failed") setTold({ kind: "error", key: Date.now() });
    else {
      setTold(null);
      setSentKinds((s) => new Set(s).add(kind));
      refresh();
    }
  };

  const retryUnsent = useCallback(async () => {
    if (sending.current || !guestSessionId) return;
    sending.current = true;
    try {
      for (const req of unsent) {
        const result = await attemptSend(req);
        if (result === "sent") {
          setTold(null);
          setSentKinds((s) => new Set(s).add(req.kind));
          refresh();
        } else if (result === "failed") setTold({ kind: "error", key: Date.now() });
      }
    } finally {
      sending.current = false;
    }
  }, [unsent, guestSessionId, attemptSend, refresh]);

  const hasUnsent = unsent.length > 0;
  useEffect(() => {
    if (!hasUnsent || !guestSessionId) return;
    const retry = () => void retryUnsent();
    window.addEventListener("online", retry);
    const interval = setInterval(retry, RETRY_MS);
    retry();
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(interval);
    };
  }, [hasUnsent, guestSessionId, retryUnsent]);

  // Game rewards (ADR-075) belong to the newest order and this guest session.
  const latestOrderId = data?.orders?.[0]?.id ?? null;
  const rewardCtx = useMemo(
    () =>
      db && guestSessionId && latestOrderId
        ? { db: db as unknown as SupabaseClient, guestSessionId, orderId: latestOrderId }
        : null,
    [db, guestSessionId, latestOrderId],
  );

  if (phase === "loading") {
    return slow ? (
      <main
        className="mx-auto w-full max-w-[720px] flex-1 animate-pulse px-4 pt-5 md:px-8 md:pt-10"
        aria-busy="true"
      >
        <div className="rounded-chip bg-mist h-10 w-2/3" />
        <div className="mt-6 grid gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-chip bg-mist h-7 w-1/2" />
          ))}
        </div>
      </main>
    ) : (
      <main className="flex-1" aria-busy="true" />
    );
  }

  const orders = data?.orders ?? [];
  if (phase === "none" || orders.length === 0) {
    // One headline, one sentence, one 56 px way back to the menu (benchmark
    // §2.3 empty states), and the bottom bar, so the waiter and the bill are
    // one tap away even before ordering from this phone.
    const emptyDock: DockItem[] = [
      { key: "menu", label: t("nav.menu"), icon: <UtensilsCrossed size={24} aria-hidden />, href: menuHref },
      { key: "order", label: t("nav.order"), icon: <ReceiptText size={24} aria-hidden />, current: true },
      ...(token
        ? [
            {
              key: "waiter",
              label: t("nav.waiter"),
              icon: <ConciergeBell size={24} aria-hidden />,
              expanded: menuWaiter.state === "confirm" || menuWaiter.state === "sending",
              onClick: menuWaiter.ask,
            },
          ]
        : []),
    ];
    return (
      <main
        data-order-empty=""
        className={`mx-auto grid w-full max-w-[720px] flex-1 content-start gap-2 px-4 pt-8 md:px-8 md:pt-14 ${DOCK_SPACE}`}
      >
        <h2 className="display-face text-headline leading-[1.2]">{t("order.empty")}</h2>
        <p className="text-muted text-body">{t("order.emptyHint")}</p>
        <a
          href={menuHref}
          className={`${guestStyles.cta} mt-4 flex min-h-14 w-full items-center justify-center px-6 text-body font-semibold md:w-auto md:justify-self-start`}
        >
          {t("order.toMenu")}
        </a>
        <GuestDock
          items={emptyDock}
          above={
            token && menuWaiter.state !== "idle" ? <CallWaiterPrompt token={token} tableId={tableId} /> : null
          }
        />
      </main>
    );
  }

  const [latest, ...earlier] = orders;
  const closed = data?.closed ?? false;
  const open = new Set((data?.requests ?? []).filter((r) => r.status !== "resolved").map((r) => r.kind));
  const latestStatus = latest ? displayStatus(latest) : null;
  const grand = orders
    .filter((o) => o.status !== "rejected" && o.status !== "cancelled")
    .reduce((s, o) => s + o.total, 0);
  // The page's secondary buttons: the page colour inside a 3:1 outline, 48 px, never wrapping.
  const secondary =
    "min-h-12 rounded-pill border border-[var(--guest-line-strong)] bg-page px-4 text-body font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 aria-pressed:bg-chip";
  // Back to the menu with an earlier round in the cart (this table's cart).
  const repeat = (order: Order) => {
    const newId = () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addToCart(cartKey(order.location_id, tableId), repeatLines(order), newId);
    try {
      window.sessionStorage.setItem(OPEN_CART_KEY, "1");
    } catch {
      // storage blocked: the menu shows its cart bar instead
    }
    router.push(menuHref);
  };
  // One dish from a "can't make" note: into this table's cart, then the menu to confirm.
  const addDish = (order: Order, itemId: string) => {
    const newId = () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addToCart(
      cartKey(order.location_id, tableId),
      [{ itemId, modifierIds: [], quantity: 1, note: "" }],
      newId,
    );
    try {
      window.sessionStorage.setItem(OPEN_CART_KEY, "1");
    } catch {
      // storage blocked: the menu shows its cart bar instead
    }
    router.push(menuHref);
  };
  const cantMake = { db, dishes: cantMakeDishes, onAdd: closed ? undefined : addDish };
  const stepButton = `${STEP} size-12`;
  // What the guest has asked for and what came of it: a banner above the bottom
  // bar, so it is never behind it. One live region; its lines change in place.
  const lines = closed ? [] : serviceLines(data?.requests ?? [], now, sentKinds);
  const notes: { key: string; text: string; tone: "ok" | "alert" }[] = [
    ...(hasUnsent ? [{ key: "unsent", text: t("order.notSent"), tone: "alert" as const }] : []),
    ...(told?.kind === "error"
      ? [{ key: `error${told.key}`, text: t("order.requestFailed"), tone: "alert" as const }]
      : []),
    ...lines.map((l) => ({
      key: l,
      text: t(
        l === "billOpen" ? "order.billTold" : l === "callAnswered" ? "order.waiterOnWay" : "order.waiterTold",
      ),
      tone: "ok" as const,
    })),
  ];
  const status = (
    <div
      role="status"
      aria-live="polite"
      data-testid="service-status"
      className={
        notes.length === 0
          ? "empty:hidden"
          : "text-ink pointer-events-auto grid gap-2 py-1 lg:bg-page lg:shadow-float lg:rounded-feature lg:px-4 lg:py-3"
      }
    >
      {notes.map((n) => (
        <p
          key={n.key}
          className={`m-0 flex items-center gap-2 px-1 font-semibold ${n.tone === "ok" ? "text-success" : "text-alert"}`}
        >
          {n.tone === "ok" && <CheckIcon />}
          {n.text}
        </p>
      ))}
      {hasUnsent && (
        <button type="button" className={`${secondary} w-full`} onClick={() => void retryUnsent()}>
          {t("order.retryRequest")}
        </button>
      )}
    </div>
  );
  const showGames = !closed && latestStatus !== "rejected" && latestStatus !== "cancelled";
  const smooth = (): ScrollBehavior =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  // The bottom bar (ADR-052): back to the menu, this order, the games while
  // waiting, and the waiter. Its Waiter item is the same request as the
  // button below the order, so it reads «Մատուցող», not the button's words.
  const dock: DockItem[] = [
    { key: "menu", label: t("nav.menu"), icon: <UtensilsCrossed size={24} aria-hidden />, href: menuHref },
    {
      key: "order",
      label: t("nav.order"),
      icon: <ReceiptText size={24} aria-hidden />,
      current: true,
      onClick: () => window.scrollTo({ top: 0, behavior: smooth() }),
    },
    ...(showGames
      ? [
          {
            key: "games",
            label: t("nav.games"),
            icon: <Gamepad2 size={24} aria-hidden />,
            onClick: () =>
              document.getElementById("games")?.scrollIntoView({ behavior: smooth(), block: "start" }),
          },
        ]
      : []),
    ...(!closed
      ? [
          {
            key: "waiter",
            label: t("nav.waiter"),
            icon: <ConciergeBell size={24} aria-hidden />,
            expanded: waiterOpen,
            disabled: asking !== null,
            onClick: () => setWaiterOpen((o) => !o),
          },
        ]
      : []),
  ];

  const row =
    "border-line flex min-h-14 w-full items-center gap-3 border-b px-1 text-left text-body font-semibold last:border-b-0 disabled:opacity-60";
  const waiterChoices = waiterOpen && !closed && (
    <div role="group" aria-label={t("nav.waiter")} className="text-ink pointer-events-auto lg:hidden">
      <button
        type="button"
        className={row}
        disabled={asking !== null}
        aria-pressed={open.has("call_waiter")}
        onClick={() => {
          setWaiterOpen(false);
          void ask("call_waiter");
        }}
      >
        <ConciergeBell size={22} aria-hidden />
        <span className="min-w-0 flex-1">{t("order.callWaiter")}</span>
      </button>
      <button
        type="button"
        className={row}
        disabled={asking !== null}
        onClick={() => {
          setWaiterOpen(false);
          setChoosing(true);
        }}
      >
        <ReceiptText size={22} aria-hidden />
        <span className="min-w-0 flex-1">{t("order.askBill")}</span>
        <ChevronRight size={20} aria-hidden className="text-muted" />
      </button>
    </div>
  );

  return (
    // The whole screen, not a small block: the order on the left, its status and
    // the menu's showcase on the right (above the order on a phone), and the
    // games across the bottom.
    <main
      data-order-page=""
      className={`mx-auto w-full max-w-[1120px] flex-1 px-4 pt-5 md:px-8 md:pt-8 ${notes.length > 0 ? DOCK_SPACE_TALL : DOCK_SPACE}`}
    >
      {latestStatus === "ready" && (
        // Decoration: the status itself is announced below and shown in the tracker.
        <div
          ref={banner}
          aria-hidden="true"
          data-testid="ready-banner"
          className={`bg-accent text-on-accent rounded-card mb-5 flex items-center gap-3 px-5 py-4 ${motionStyles.banner}`}
        >
          <span className="bg-on-accent text-accent grid size-9 flex-none place-items-center rounded-full">
            <CheckIcon />
          </span>
          <span className="display-face text-[1.125rem] leading-none">{t("order.steps.ready")}</span>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-12">
        <div className="order-2 min-w-0 lg:order-1">
          {latest && (
            <OrderCard
              order={latest}
              latest
              part="lines"
              details={details}
              onRepeat={closed ? undefined : repeat}
              cantMake={cantMake}
            />
          )}
          {channel === "down" && <p className="text-muted -mt-2 mb-3 text-label">{t("order.reconnecting")}</p>}
          <p className="sr-only" role="status" aria-live="polite">
            {latestStatus
              ? t(
                  `order.steps.${latestStatus === "rejected" || latestStatus === "cancelled" ? "received" : latestStatus}`,
                )
              : null}
          </p>

          {closed ? (
            <div className="my-4">
              <Notice tone="calm">{t("order.tableClosed")}</Notice>
            </div>
          ) : (
            <>
              {db && guestSessionId && latestStatus && waiting.has(latestStatus) && (
                <NotifyReady db={db} guestSessionId={guestSessionId} vapidPublicKey={vapidPublicKey} />
              )}
              <div className="grid gap-2 min-[420px]:grid-cols-2 min-[420px]:gap-3">
                <button
                  type="button"
                  className={secondary}
                  aria-pressed={open.has("call_waiter")}
                  disabled={asking !== null}
                  onClick={() => void ask("call_waiter")}
                >
                  {t("order.callWaiter")}
                </button>
                <button
                  type="button"
                  className={secondary}
                  aria-pressed={open.has("bring_bill")}
                  disabled={asking !== null}
                  aria-expanded={choosing}
                  ref={billButton}
                  onClick={() => setChoosing((x) => !x)}
                >
                  {t("order.askBill")}
                </button>
              </div>
              {choosing && (
                <div
                  role="group"
                  aria-label={t("order.payTitle")}
                  data-testid="pay-choice"
                  ref={payPanel}
                  className="mt-3 grid scroll-mb-[calc(110px+env(safe-area-inset-bottom,0px))] gap-2"
                >
                  {grand > 0 && (
                    <div className="border-line mb-2 grid gap-2 border-y py-4" data-testid="split">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-semibold">{t("order.splitLabel")}</span>
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className={stepButton}
                            aria-label={t("order.splitFewer")}
                            disabled={people <= 1}
                            onClick={() => setPeople((n) => Math.max(1, n - 1))}
                          >
                            <MinusIcon />
                          </button>
                          <output className="num min-w-[5.5rem] text-center font-semibold" aria-live="polite">
                            {t("order.splitPeople", { count: people })}
                          </output>
                          <button
                            type="button"
                            className={stepButton}
                            aria-label={t("order.splitMore")}
                            disabled={people >= MAX_PEOPLE}
                            onClick={() => setPeople((n) => Math.min(MAX_PEOPLE, n + 1))}
                          >
                            <PlusIcon />
                          </button>
                        </span>
                      </div>
                      {people > 1 && (
                        <p
                          className="num text-ink text-[2rem] leading-[1.1] font-bold"
                          data-testid="split-share"
                        >
                          {t("order.splitEach", {
                            amount: formatAmd(shareOf(grand, people), locale as Locale),
                          })}
                        </p>
                      )}
                      <p className="text-muted text-label">{t("order.splitNote")}</p>
                    </div>
                  )}
                  <p className="m-0 font-semibold">{t("order.payTitle")}</p>
                  <div className="grid grid-cols-2 gap-2 min-[420px]:gap-3">
                    <button
                      type="button"
                      className={secondary}
                      onClick={() => void ask("bring_bill", "card")}
                    >
                      {t("order.payCard")}
                    </button>
                    <button
                      type="button"
                      className={secondary}
                      onClick={() => void ask("bring_bill", "cash")}
                    >
                      {t("order.payCash")}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="text-accent-text min-h-12 justify-self-start font-semibold"
                    onClick={() => {
                      setChoosing(false);
                      billButton.current?.focus({ preventScroll: true });
                    }}
                  >
                    {t("order.payBack")}
                  </button>
                </div>
              )}
            </>
          )}

          {earlier.length > 0 && (
            <section className="mt-8 grid gap-4" aria-labelledby="earlier-orders">
              <h2 id="earlier-orders" className="text-name font-semibold">
                {t("order.earlier")}
              </h2>
              {earlier.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  latest={false}
                  details={details}
                  onRepeat={closed ? undefined : repeat}
                  cantMake={cantMake}
                />
              ))}
              <div className="border-line flex items-baseline justify-between border-t py-4 text-name font-semibold">
                <span>{t("order.allRounds")}</span>
                <span className="num">{formatAmd(grand, locale as Locale)}</span>
              </div>
            </section>
          )}
        </div>
        <aside
          className="order-1 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:sticky lg:top-8 lg:order-2"
          aria-label={t("order.status")}
        >
          {latest && <OrderCard order={latest} latest part="status" wait={wait} />}
        </aside>
      </div>
      <div className="border-line mt-10 border-t pt-6">
        <Rise>
          <RecommendedCard
            dishes={dishes}
            menuHref={menuHref}
            onAdd={closed || !latest ? undefined : (itemId) => addDish(latest, itemId)}
            pairs={pairs}
            ordered={orders.flatMap((o) => o.order_items.flatMap((l) => (l.item_id ? [l.item_id] : [])))}
          />
        </Rise>
      </div>
      {showGames && latestStatus !== null && (
        <div className="mt-8">
          <Rise>
            <GamesCorner
              ready={latestStatus === "ready"}
              waiting={waiting.has(latestStatus)}
              reward={rewardCtx}
            />
          </Rise>
        </div>
      )}
      <GuestDock
        items={dock}
        above={
          <>
            {waiterChoices}
            {status}
          </>
        }
      />
    </main>
  );
}
