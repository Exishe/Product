"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { localized } from "@/features/menu/guest-menu/view-model";
import { CheckIcon, Notice, Txt } from "@/features/menu/guest-menu/ui";
import type { Locale } from "@/i18n/routing";
import { formatTime } from "@/lib/format/date";
import { formatAmd } from "@/lib/format/money";
import { useGuestChannel } from "@/lib/realtime/use-guest-channel";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { Database } from "@/lib/supabase/database";
import { useGuestI18n } from "./guest-i18n-context";
import { loadGuestSession, saveGuestSession } from "./guest-session";
import { displayStatus, isActive, STEPS, stepIndex, type DisplayStatus, type OrderState } from "./order-status";

type Db = SupabaseClient<Database>;
type Names = Record<string, string | null> | null;
type Line = {
  id: string;
  name_i18n: Names;
  quantity: number;
  cancelled_quantity: number;
  line_total: number;
  note: string | null;
  sort: number;
  order_item_modifiers: { name_i18n: Names }[];
};
type Order = OrderState & { id: string; number: number; total: number; placed_at: string; reject_reason: string | null; order_items: Line[] };
type Request = { id: string; kind: "call_waiter" | "bring_bill"; status: string };
type Data = { orders: Order[]; requests: Request[]; closed: boolean };

const ORDER_COLUMNS =
  "id, number, status, kitchen_status, paid_at, total, placed_at, reject_reason, possible_duplicate_of, " +
  "order_items(id, name_i18n, quantity, cancelled_quantity, line_total, note, sort, order_item_modifiers(name_i18n))";

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
    db.from("orders").select(ORDER_COLUMNS).eq("guest_session_id", guestSessionId).order("placed_at", { ascending: false }),
    db.from("service_requests").select("id, kind, status").eq("guest_session_id", guestSessionId).neq("status", "resolved"),
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

function Tracker({ order, status }: { order: Order; status: DisplayStatus }) {
  const { t } = useGuestI18n();
  const now = stepIndex(status);
  const steps: string[] = status === "paid" ? [...STEPS, "paid"] : [...STEPS];
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
        return (
          <li key={step} className="relative grid min-h-[52px] grid-cols-[28px_1fr] items-start gap-3" aria-current={current ? "step" : undefined}>
            {!last && <span aria-hidden="true" className={`absolute top-7 -bottom-1 left-[13px] w-0.5 ${i < now ? "bg-tarragon" : "bg-line"}`} />}
            <span
              aria-hidden="true"
              className={`z-[1] grid size-7 place-items-center rounded-full border-2 ${
                done ? "border-tarragon bg-tarragon text-white" : "border-line-strong bg-matsoni"
              } ${current ? "shadow-[0_0_0_5px_var(--color-tarragon-tint)]" : ""}`}
            >
              {done ? <CheckIcon /> : null}
            </span>
            <div className={current ? "pb-3" : ""}>
              <div className={`leading-7 ${done ? "font-semibold" : "text-muted"}`}>{t(`order.steps.${step}`)}</div>
              {current && <p className="text-sm text-muted">{note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OrderCard({ order, latest }: { order: Order; latest: boolean }) {
  const { t, locale } = useGuestI18n();
  const status = displayStatus(order);
  const lines = [...order.order_items].sort((a, b) => a.sort - b.sort);
  const Title = latest ? "h2" : "h3";
  return (
    <article className={latest ? "" : "border-t border-line pt-4"} data-testid="order" data-order-number={order.number} data-status={status}>
      <div className="flex items-baseline justify-between gap-3">
        <Title className={`display-face leading-[1.05] ${latest ? "text-display-38" : "text-2xl"}`}>{t("order.title", { number: order.number })}</Title>
        {!latest && <span className="text-sm font-semibold text-tarragon">{t(`order.steps.${status === "rejected" || status === "cancelled" ? "received" : status}`)}</span>}
      </div>
      <p className="text-sm text-muted">{t("order.placedAt", { time: formatTime(new Date(order.placed_at)) })}</p>
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
        <Tracker order={order} status={status} />
      ) : null}
      <ul className="mt-2">
        {lines.map((l) => {
          const name = localized(l.name_i18n, locale as Locale);
          const left = l.quantity - l.cancelled_quantity;
          const mods = l.order_item_modifiers.map((m) => localized(m.name_i18n, locale as Locale)).filter((m) => m !== null);
          return (
            <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-line py-3">
              <span className={`display-face text-xl leading-tight [overflow-wrap:anywhere] ${left === 0 ? "text-muted line-through" : ""}`}>
                <span className="num">
                  {l.cancelled_quantity > 0 && left > 0 ? <s className="mr-1 text-muted">{l.quantity}</s> : null}
                  {left > 0 ? left : l.quantity}
                </span>
                {" × "}
                {name ? <Txt value={name} locale={locale as Locale} /> : null}
              </span>
              <span className="num text-right font-semibold whitespace-nowrap">{left > 0 ? formatAmd(l.line_total, locale as Locale) : t("order.lineCancelled")}</span>
              {mods.length > 0 && (
                <span className="col-start-1 text-sm text-muted">
                  {mods.map((m, i) => (
                    <span key={i}>
                      {i > 0 ? ", " : null}
                      <Txt value={m} locale={locale as Locale} />
                    </span>
                  ))}
                </span>
              )}
              {l.note && <span className="col-start-1 text-sm break-words text-muted">{l.note}</span>}
            </li>
          );
        })}
      </ul>
      <div className="flex items-baseline justify-between py-4 text-xl font-semibold">
        <span>{t("order.total")}</span>
        <span className="num">{formatAmd(status === "rejected" || status === "cancelled" ? 0 : order.total, locale as Locale)}</span>
      </div>
    </article>
  );
}

// The order status page: the guest's orders at this table (read through RLS),
// newest first, live over the guest's Realtime channel with a 10-second
// safety poll, plus "call the waiter" and "ask for the bill".
export function OrderStatusView({ tableId, menuHref }: { tableId: string; menuHref: string }) {
  const { t, locale } = useGuestI18n();
  const [db] = useState<Db | null>(() => (typeof window === "undefined" ? null : getBrowserClient()));
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "none">("loading");
  const [slow, setSlow] = useState(false);
  const [told, setTold] = useState<{ kind: Request["kind"] | "error"; key: number } | null>(null);
  const [asking, setAsking] = useState<Request["kind"] | null>(null);

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

  const active = useMemo(() => (data ? data.orders.some(isActive) || data.requests.length > 0 : false), [data]);
  const channel = useGuestChannel({ supabase: db, guestSessionId, refresh, poll: active && !data?.closed });

  const ask = async (kind: Request["kind"]) => {
    if (!db || !guestSessionId) return;
    setAsking(kind);
    const { error } = await db.schema("api").rpc("guest_service_request", { p_guest_session_id: guestSessionId, p_kind: kind });
    setAsking(null);
    setTold({ kind: error ? "error" : kind, key: Date.now() });
    if (!error) refresh();
  };

  if (phase === "loading") {
    return slow ? (
      <main className="flex-1 animate-pulse px-4 pt-4" aria-busy="true">
        <div className="h-10 w-2/3 rounded-chip bg-mist" />
        <div className="mt-6 grid gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 w-1/2 rounded-chip bg-mist" />
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
      <main className="flex flex-1 flex-col items-start gap-3 px-4 py-10">
        <h2 className="display-face text-3xl">{t("order.empty")}</h2>
        <p className="text-muted">{t("order.emptyHint")}</p>
        <a href={menuHref} className="inline-flex min-h-12 items-center font-semibold text-tarragon">
          {t("order.toMenu")}
        </a>
      </main>
    );
  }

  const [latest, ...earlier] = orders;
  const closed = data?.closed ?? false;
  const open = new Set((data?.requests ?? []).map((r) => r.kind));
  const latestStatus = latest ? displayStatus(latest) : null;
  const grand = orders.filter((o) => o.status !== "rejected" && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const secondary =
    "min-h-[52px] rounded-sheet border border-line-strong bg-white px-3 font-semibold disabled:opacity-60 aria-pressed:border-tarragon aria-pressed:bg-tarragon-tint";

  return (
    <main className="flex-1 px-4 pt-3 pb-10">
      {latest && <OrderCard order={latest} latest />}
      {channel === "down" && <p className="-mt-2 mb-2 text-sm text-muted">{t("order.reconnecting")}</p>}
      <p className="sr-only" role="status" aria-live="polite">
        {latestStatus ? t(`order.steps.${latestStatus === "rejected" || latestStatus === "cancelled" ? "received" : latestStatus}`) : null}
      </p>

      {closed ? (
        <div className="my-4">
          <Notice tone="calm">{t("order.tableClosed")}</Notice>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className={secondary} aria-pressed={open.has("call_waiter")} disabled={asking !== null} onClick={() => void ask("call_waiter")}>
              {t("order.callWaiter")}
            </button>
            <button type="button" className={secondary} aria-pressed={open.has("bring_bill")} disabled={asking !== null} onClick={() => void ask("bring_bill")}>
              {t("order.askBill")}
            </button>
          </div>
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
            <a href={menuHref} className="inline-flex min-h-12 items-center font-semibold text-tarragon">
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
            <OrderCard key={o.id} order={o} latest={false} />
          ))}
          <div className="flex items-baseline justify-between border-t border-line py-4 text-xl font-semibold">
            <span>{t("order.allRounds")}</span>
            <span className="num">{formatAmd(grand, locale as Locale)}</span>
          </div>
        </section>
      )}
    </main>
  );
}
