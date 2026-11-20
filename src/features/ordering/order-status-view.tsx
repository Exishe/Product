"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { warmMotion } from "@/features/guest-theme/motion/motion";
import motionStyles from "@/features/guest-theme/motion/motion.module.css";
import { sparkFrom } from "@/features/guest-theme/motion/spark";
import { waitState, type WaitRange } from "@/features/menu/guest-menu/hints";
import { localized } from "@/features/menu/guest-menu/view-model";
import { CheckIcon, MinusIcon, Notice, PlusIcon, STEP, Txt } from "@/features/menu/guest-menu/ui";
import type { Locale } from "@/i18n/routing";
import { formatTime } from "@/lib/format/date";
import { formatAmd } from "@/lib/format/money";
import { useGuestChannel } from "@/lib/realtime/use-guest-channel";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { Database } from "@/lib/supabase/database";
import { OPEN_CART_KEY, addToCart, cartKey } from "./cart-store";
import { MAX_PEOPLE, repeatLines, shareOf } from "./repeat";
import { useGuestI18n } from "./guest-i18n-context";
import { loadGuestSession, saveGuestSession } from "./guest-session";
import { NotifyReady } from "./notify-ready";
import { GamesCorner } from "@/features/games/games-corner";
import { DOCK_SPACE, GuestDock, type DockItem } from "@/features/menu/guest-menu/guest-dock";
import { ConciergeBell, Gamepad2, ReceiptText, RotateCcw, UtensilsCrossed } from "lucide-react";
import {
  displayStatus,
  isActive,
  STEPS,
  stepIndex,
  type DisplayStatus,
  type OrderState,
} from "./order-status";

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
type Request = { id: string; kind: "call_waiter" | "bring_bill"; status: string };
type Data = { orders: Order[]; requests: Request[]; closed: boolean };

// The stages before "ready": the only time «Notify me when it's ready» makes sense.
const waiting = new Set<DisplayStatus>(["received", "accepted", "cooking"]);

const ORDER_COLUMNS =
  "id, location_id, number, status, kitchen_status, paid_at, total, placed_at, reject_reason, possible_duplicate_of, " +
  "order_items(id, item_id, name_i18n, quantity, cancelled_quantity, line_total, note, sort, order_item_modifiers(name_i18n, modifier_id))";

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

async function load(db: Db, guestSessionId: string): Promise<Data | null> {
  const [orders, requests, session] = await Promise.all([
    db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("guest_session_id", guestSessionId)
      .order("placed_at", { ascending: false }),
    db
      .from("service_requests")
      .select("id, kind, status")
      .eq("guest_session_id", guestSessionId)
      .neq("status", "resolved"),
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

// The steps one after another (ms): a done step ticks in on a spring, then
// the line below it fills down to the next. On first view they play in turn;
// a step reached later (live) plays at once.
const BEAT = 450;

function Tracker({ order, status }: { order: Order; status: DisplayStatus }) {
  const { t } = useGuestI18n();
  const now = stepIndex(status);
  const steps: string[] = status === "paid" ? [...STEPS, "paid"] : [...STEPS];
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
    <ol className="my-6 grid" data-testid="tracker">
      {steps.map((step, i) => {
        const done = i <= now;
        const current = i === now;
        const last = i === steps.length - 1;
        const tickAt = { "--d": `${settled ? BEAT : i * BEAT}ms` } as CSSProperties;
        const fillAt = { "--d": `${settled ? 0 : i * BEAT + 120}ms` } as CSSProperties;
        return (
          <li
            key={step}
            className="relative grid min-h-[52px] grid-cols-[28px_1fr] items-start gap-3"
            aria-current={current ? "step" : undefined}
          >
            {!last && (
              <span
                aria-hidden="true"
                className="bg-line absolute top-7 -bottom-1 left-[13px] w-0.5 overflow-hidden"
              >
                <span className={`bg-tarragon ${motionStyles.fill}`} data-on={i < now} style={fillAt} />
              </span>
            )}
            <span
              aria-hidden="true"
              className={`relative z-[1] grid size-7 place-items-center rounded-full border-2 ${
                done ? "border-tarragon bg-matsoni text-white" : "border-line-strong bg-matsoni"
              } ${current ? "shadow-[0_0_0_5px_var(--color-tarragon-tint)]" : ""}`}
            >
              {current && status !== "served" && status !== "paid" ? (
                <span className={motionStyles.pulse} />
              ) : null}
              {done ? (
                <span
                  className={`bg-tarragon absolute -inset-0.5 place-items-center rounded-full ${motionStyles.tick}`}
                  style={tickAt}
                >
                  <CheckIcon />
                </span>
              ) : null}
            </span>
            <div className={current ? "pb-3" : ""}>
              <div className={`leading-7 ${done ? "font-semibold" : "text-muted"}`}>
                {t(`order.steps.${step}`)}
              </div>
              {current && <p className="text-muted text-sm">{note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
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
    <p className="text-muted -mt-2 mb-4 text-sm" data-testid="order-wait" data-late={late}>
      {late ? t("wait.late") : t(wait.low === wait.high ? "wait.usualOne" : "wait.usual", wait)}
    </p>
  );
}

function OrderCard({
  order,
  latest,
  below,
  wait = null,
  details,
  onRepeat,
}: {
  order: Order;
  latest: boolean;
  details?: Record<string, string>;
  below?: ReactNode;
  wait?: WaitRange | null;
  /** "Order the same again": back to the menu with these dishes in the cart. */
  onRepeat?: (order: Order) => void;
}) {
  const { t, locale } = useGuestI18n();
  const status = displayStatus(order);
  const lines = [...order.order_items].sort((a, b) => a.sort - b.sort);
  const Title = latest ? "h2" : "h3";
  return (
    <article
      className={
        latest
          ? "bg-surface shadow-card rounded-feature mb-5 border [border-color:var(--guest-card-border)] px-5 pt-6 pb-1 md:px-8 md:pt-8"
          : "border-line border-t pt-4"
      }
      data-testid="order"
      data-order-number={order.number}
      data-status={status}
    >
      <div className="flex items-baseline justify-between gap-3">
        <Title
          className={`display-face leading-[1.05] ${latest ? "text-[2.75rem] md:text-[3.25rem]" : "text-2xl"}`}
        >
          {t("order.title", { number: order.number })}
        </Title>
        {!latest && (
          <span className="text-muted text-sm font-semibold">
            {t(`order.steps.${status === "rejected" || status === "cancelled" ? "received" : status}`)}
          </span>
        )}
      </div>
      <p className="text-muted text-sm">
        {t("order.placedAt", { time: formatTime(new Date(order.placed_at)) })}
      </p>
      {status === "rejected" ? (
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
      ) : null}
      {below}
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
              className="border-line grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b py-3 last:border-b-0"
            >
              <span
                className={`display-face text-xl leading-tight [overflow-wrap:anywhere] ${left === 0 ? "text-muted line-through" : ""}`}
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
              <span className="num text-right font-semibold whitespace-nowrap">
                {left > 0 ? formatAmd(l.line_total, locale as Locale) : t("order.lineCancelled")}
              </span>
              {l.item_id && details?.[l.item_id] && (
                <span className="text-soft col-start-1 text-sm break-words" data-testid="line-detail">
                  {details[l.item_id]}
                </span>
              )}
              {mods.length > 0 && (
                <span className="text-muted col-start-1 text-sm">
                  {mods.map((m, i) => (
                    <span key={i}>
                      {i > 0 ? ", " : null}
                      <Txt value={m} locale={locale as Locale} />
                    </span>
                  ))}
                </span>
              )}
              {l.note && <span className="text-muted col-start-1 text-sm break-words">{l.note}</span>}
            </li>
          );
        })}
      </ul>
      <div className="flex items-baseline justify-between py-4 text-xl font-semibold">
        <span>{t("order.total")}</span>
        <span className="num">
          {formatAmd(status === "rejected" || status === "cancelled" ? 0 : order.total, locale as Locale)}
        </span>
      </div>
      {onRepeat && status !== "rejected" && status !== "cancelled" && repeatLines(order).length > 0 && (
        <p className={latest ? "-mt-1 pb-5" : "-mt-2 pb-2"}>
          <button
            type="button"
            onClick={() => onRepeat(order)}
            className="rounded-pill text-ink hover:bg-chip inline-flex min-h-11 items-center gap-2 border [border-color:color-mix(in_srgb,var(--guest-line-strong)_60%,transparent)] px-4 text-sm font-semibold"
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
  menuHref,
  vapidPublicKey = null,
  wait = null,
  details,
}: {
  tableId: string;
  menuHref: string;
  vapidPublicKey?: string | null;
  /** The café's usual wait (ADR-060); null when it can't say, or the kitchen set its own. */
  wait?: WaitRange | null;
  /** Descriptions of same-named dishes by dish id (view-model sameNameDetails). */
  details?: Record<string, string>;
}) {
  const { t, locale } = useGuestI18n();
  const [db] = useState<Db | null>(() => (typeof window === "undefined" ? null : getBrowserClient()));
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "none">("loading");
  const [slow, setSlow] = useState(false);
  const [told, setTold] = useState<{ kind: Request["kind"] | "error"; key: number } | null>(null);
  const [asking, setAsking] = useState<Request["kind"] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [people, setPeople] = useState(1);
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
    void load(db, guestSessionId).then((loaded) => loaded && setData(loaded));
  }, [db, guestSessionId]);

  const active = useMemo(
    () => (data ? data.orders.some(isActive) || data.requests.length > 0 : false),
    [data],
  );

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

  const ask = async (kind: Request["kind"], payment?: "card" | "cash") => {
    if (!db || !guestSessionId) return;
    setChoosing(false);
    setAsking(kind);
    const { error } = await db.schema("api").rpc("guest_service_request", {
      p_guest_session_id: guestSessionId,
      p_kind: kind,
      ...(payment ? { p_payment_preference: payment } : {}),
    });
    setAsking(null);
    setTold({ kind: error ? "error" : kind, key: Date.now() });
    if (!error) refresh();
  };

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
    return (
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-start gap-3 px-4 py-10 md:px-8 md:py-16">
        <h2 className="display-face text-3xl">{t("order.empty")}</h2>
        <p className="text-muted">{t("order.emptyHint")}</p>
        <a href={menuHref} className="text-accent-text inline-flex min-h-12 items-center font-semibold">
          {t("order.toMenu")}
        </a>
      </main>
    );
  }

  const [latest, ...earlier] = orders;
  const closed = data?.closed ?? false;
  const open = new Set((data?.requests ?? []).map((r) => r.kind));
  const latestStatus = latest ? displayStatus(latest) : null;
  const grand = orders
    .filter((o) => o.status !== "rejected" && o.status !== "cancelled")
    .reduce((s, o) => s + o.total, 0);
  const secondary =
    "min-h-[52px] rounded-pill border [border-color:var(--guest-field-edge)] bg-surface px-4 font-semibold shadow-card disabled:opacity-60 aria-pressed:border-accent-text aria-pressed:bg-chip";
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
  const stepButton = `${STEP} size-12`;
  const showGames = !closed && latestStatus !== "rejected" && latestStatus !== "cancelled";
  const smooth = (): ScrollBehavior =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  // The bottom bar (ADR-052): back to the menu, this order, the games while
  // waiting, and the waiter. Its Waiter item is the same request as the
  // button below the order, so it reads «Մատուցող», not the button's words.
  const dock: DockItem[] = [
    { key: "menu", label: t("nav.menu"), icon: <UtensilsCrossed size={22} aria-hidden />, href: menuHref },
    {
      key: "order",
      label: t("nav.order"),
      icon: <ReceiptText size={22} aria-hidden />,
      current: true,
      onClick: () => window.scrollTo({ top: 0, behavior: smooth() }),
    },
    ...(showGames
      ? [
          {
            key: "games",
            label: t("nav.games"),
            icon: <Gamepad2 size={22} aria-hidden />,
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
            icon: <ConciergeBell size={22} aria-hidden />,
            pressed: open.has("call_waiter"),
            disabled: asking !== null,
            onClick: () => void ask("call_waiter"),
          },
        ]
      : []),
  ];

  return (
    <main className={`mx-auto w-full max-w-[720px] flex-1 px-4 pt-5 md:px-8 md:pt-10 ${DOCK_SPACE}`}>
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
          <span className="display-face text-[1.75rem] leading-none">{t("order.steps.ready")}</span>
        </div>
      )}
      {latest && (
        <OrderCard
          order={latest}
          latest
          wait={wait}
          details={details}
          onRepeat={closed ? undefined : repeat}
          // The games sit right under the status while the guest waits: the
          // moment they have nothing to do but watch the tracker.
          below={
            !showGames ? null : (
              <GamesCorner
                ready={latestStatus === "ready"}
                waiting={latestStatus !== null && waiting.has(latestStatus)}
              />
            )
          }
        />
      )}
      {channel === "down" && <p className="text-muted -mt-2 mb-2 text-sm">{t("order.reconnecting")}</p>}
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
          <div className="grid grid-cols-2 gap-3">
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
              className="mt-3 grid gap-2"
            >
              {grand > 0 && (
                <div
                  className="bg-surface shadow-card rounded-card mb-2 grid gap-2 border [border-color:var(--guest-card-border)] px-4 py-3"
                  data-testid="split"
                >
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
                    <p className="num text-accent-text text-xl font-semibold" data-testid="split-share">
                      {t("order.splitEach", { amount: formatAmd(shareOf(grand, people), locale as Locale) })}
                    </p>
                  )}
                  <p className="text-muted text-sm">{t("order.splitNote")}</p>
                </div>
              )}
              <p className="m-0 font-semibold">{t("order.payTitle")}</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className={secondary} onClick={() => void ask("bring_bill", "card")}>
                  {t("order.payCard")}
                </button>
                <button type="button" className={secondary} onClick={() => void ask("bring_bill", "cash")}>
                  {t("order.payCash")}
                </button>
              </div>
              <button
                type="button"
                className="text-accent-text min-h-12 justify-self-start font-semibold"
                onClick={() => setChoosing(false)}
              >
                {t("order.payBack")}
              </button>
            </div>
          )}
          <p className="mt-2 min-h-6 text-sm" role="status" aria-live="polite" key={told?.key}>
            {told?.kind === "error"
              ? t("order.requestFailed")
              : told?.kind === "bring_bill" || (!told && open.has("bring_bill"))
                ? t("order.billTold")
                : told?.kind === "call_waiter" || open.has("call_waiter")
                  ? t("order.waiterTold")
                  : null}
          </p>
          <p>
            <a href={menuHref} className="text-accent-text inline-flex min-h-12 items-center font-semibold">
              {t("order.orderMore")}
            </a>
          </p>
        </>
      )}

      {earlier.length > 0 && (
        <section className="mt-8 grid gap-4" aria-labelledby="earlier-orders">
          <h2 id="earlier-orders" className="text-lg font-semibold">
            {t("order.earlier")}
          </h2>
          {earlier.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              latest={false}
              details={details}
              onRepeat={closed ? undefined : repeat}
            />
          ))}
          <div className="border-line flex items-baseline justify-between border-t py-4 text-xl font-semibold">
            <span>{t("order.allRounds")}</span>
            <span className="num">{formatAmd(grand, locale as Locale)}</span>
          </div>
        </section>
      )}
      <GuestDock items={dock} />
    </main>
  );
}
