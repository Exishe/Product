"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/routing";
import { formatTime } from "@/lib/format/date";
import { OutboxProvider, useOutbox } from "@/lib/offline/outbox-provider";
import { useLocationChannel, type LocationMessage } from "@/lib/realtime/use-location-channel";
import { getBrowserClient } from "@/lib/supabase/browser";
import { heartbeat, kitchenActionKey, kitchenSender, markTicketsSeen, sameKitchenAction, setKitchenBusy, setSoldOut } from "./actions";
import { ConnectionPill, DisconnectedScreen, Toasts, type Toast } from "./board-chrome";
import { fetchBusy, fetchSoldOut, fetchTicketRows, type BusyState } from "./board-data";
import {
  applyPending,
  groupTickets,
  toBoardTickets,
  type BoardTicket,
  type KitchenAction,
  type ShownTicket,
  type TicketStatus,
} from "./board-model";
import { BusySwitch } from "./busy-switch";
import { nextBusinessDayStart } from "./business-day";
import { connectionState, troubleSince } from "./connection";
import { StartShiftOverlay, useShift } from "./start-shift";
import type { DishSection } from "./station-dishes";
import { StopList } from "./stop-list";
import { OrderTicketCard, VoidTicketCard, type Column } from "./ticket-card";
import { useServerClock } from "./use-server-clock";

export type KitchenBoardProps = {
  station: { id: string; title: string };
  otherStations: { id: string; title: string }[];
  location: { id: string; restaurantId: string; timeZone: string; businessDayStarts: string };
  initialTickets: BoardTicket[];
  initialBusy: BusyState;
  initialSoldOut: string[];
  dishes: DishSection[];
  renderedAt: number;
  userId: string;
  memberId: string;
  isDevice: boolean;
};

const POLL_MS = 10_000; // safety poll under the live channel (realtime.md)
const HEARTBEAT_MS = 60_000;
const TOAST_MS = 6_000;
const FRESH_MS = 1_500;
const LIVE: readonly TicketStatus[] = ["new", "cooking", "ready"];

const client = getBrowserClient as unknown as () => SupabaseClient;

// The kitchen board (screens.md §7, design/kitchen.html). Server-rendered with
// the first tickets, then kept live: Broadcast hints trigger a refetch, a
// 10-second poll covers a dead socket, and taps go through the offline outbox.
export function KitchenBoard(props: KitchenBoardProps) {
  const send = useMemo(() => kitchenSender(getBrowserClient), []);
  return (
    <OutboxProvider
      name={`pativ-kitchen-outbox-${props.memberId}`}
      send={send}
      sameAction={sameKitchenAction}
      groupKey={kitchenActionKey}
    >
      <Board {...props} />
    </OutboxProvider>
  );
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

function Board(p: KitchenBoardProps) {
  const t = useTranslations("kitchen");
  const locale = useLocale() as Locale;
  const now = useServerClock(p.renderedAt);
  const shift = useShift();
  const outbox = useOutbox<KitchenAction>();
  const browserOnline = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  const [tickets, setTickets] = useState(p.initialTickets);
  const [busy, setBusy] = useState(p.initialBusy);
  const [soldOutIds, setSoldOutIds] = useState<ReadonlySet<string>>(() => new Set(p.initialSoldOut));
  const [fetchFailed, setFetchFailed] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(p.renderedAt);
  const [sent, setSent] = useState<{ action: KitchenAction; at: number }[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [revoked, setRevoked] = useState(false);
  const [trouble, setTrouble] = useState<number | null>(null);

  const nowRef = useRef(now);
  const ticketsRef = useRef(tickets);
  const notifyRef = useRef(shift.notify);
  useEffect(() => {
    nowRef.current = now;
    ticketsRef.current = tickets;
    notifyRef.current = shift.notify;
  });

  // --- Reading -------------------------------------------------------------
  const known = useRef(new Set(p.initialTickets.map((x) => x.id)));
  const inFlight = useRef(false);
  const again = useRef(false);

  // One request at a time; hints that arrive meanwhile cause exactly one more.
  const refreshTickets = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const startedAt = performance.now();
        const res = await fetchTicketRows(getBrowserClient(), p.station.id);
        if (!res.ok) {
          setFetchFailed(true);
          return;
        }
        const next = toBoardTickets(res.data, locale);
        const arrived = next.filter((x) => !known.current.has(x.id));
        for (const x of next) known.current.add(x.id);
        setTickets(next);
        setFetchFailed(false);
        setLastSyncAt(nowRef.current);
        // Taps already sent are confirmed by any refresh that started after them.
        setSent((list) => list.filter((s) => s.at > startedAt));
        if (arrived.length > 0) {
          setFresh(new Set(arrived.map((x) => x.id)));
          if (arrived.some((x) => x.kind === "void" || x.status === "new")) notifyRef.current();
        }
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, [p.station.id, locale]);

  const refreshExtras = useCallback(async () => {
    const sb = getBrowserClient();
    const [b, s] = await Promise.all([fetchBusy(sb, p.location.id), fetchSoldOut(sb, p.location.id, new Date(nowRef.current))]);
    if (b.ok && b.data === null) setRevoked(true);
    else if (b.ok && b.data) setBusy(b.data);
    if (s.ok) setSoldOutIds(new Set(s.data));
  }, [p.location.id]);

  const refreshAll = useCallback(() => {
    void refreshTickets();
    void refreshExtras();
  }, [refreshTickets, refreshExtras]);

  // Broadcast hints: patch at once, then refetch the truth.
  const onMessage = useCallback(
    (m: LocationMessage) => {
      if (m.event === "ticket") {
        if (m.payload.station_id !== p.station.id) return;
        const id = String(m.payload.id);
        const status = m.payload.status as TicketStatus;
        const gone = !LIVE.includes(status) || m.payload.acknowledged === true;
        setTickets((list) =>
          gone ? list.filter((x) => x.id !== id) : list.map((x) => (x.id === id && x.kind === "order" ? { ...x, status } : x)),
        );
        void refreshTickets();
      } else if (m.event === "order") {
        if (m.payload.paid === true || m.payload.status === "cancelled") void refreshTickets();
      } else if (m.event === "location") {
        setBusy({
          until: typeof m.payload.kitchen_busy_until === "string" ? m.payload.kitchen_busy_until : null,
          minutes: typeof m.payload.expected_wait_minutes === "number" ? m.payload.expected_wait_minutes : null,
        });
      }
    },
    [p.station.id, refreshTickets],
  );
  const channel = useLocationChannel(client, p.location.id, onMessage);

  // On join and on every rejoin: refetch everything, never replay the gap.
  useEffect(() => {
    if (channel === "subscribed") refreshAll();
  }, [channel, refreshAll]);

  useEffect(() => {
    const poll = window.setInterval(refreshAll, POLL_MS);
    const onOnline = () => refreshAll();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshAll]);

  // --- Connection label ----------------------------------------------------
  const networkDown = !browserOnline || fetchFailed;
  useEffect(() => {
    setTrouble((prev) => troubleSince(prev, networkDown, nowRef.current));
  }, [networkDown]);
  const connection = connectionState({ browserOnline, lastFetchFailed: fetchFailed, channel, troubleSince: trouble, now });

  // --- Taps ----------------------------------------------------------------
  const pushToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { ...toast, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  useEffect(
    () =>
      outbox.subscribe((e) => {
        if (e.type === "sent") {
          setSent((list) => [...list, { action: e.entry.action, at: performance.now() }]);
          void refreshTickets();
        } else if (e.type === "stale" || e.type === "failed") {
          // Someone else changed the ticket first (Review focus 4): say so, show the truth.
          const table = ticketsRef.current.find((x) => x.id === e.entry.action.ticketId)?.table;
          pushToast({
            tone: e.type === "stale" ? "conflict" : "error",
            title: e.type === "stale" ? t("conflict") : t("actionFailed"),
            detail: table ? t("ticket.tableLabel", { table }) : undefined,
          });
          void refreshTickets();
        } else if (e.type === "forbidden") {
          setRevoked(true);
        }
      }),
    [outbox, refreshTickets, pushToast, t],
  );

  const act = useCallback((action: KitchenAction) => void outbox.enqueue(action), [outbox]);

  const shown = useMemo(
    () =>
      applyPending(tickets, [
        ...sent.map((s) => ({ action: s.action, waiting: false })),
        ...outbox.entries.map((e) => ({ action: e.action, waiting: true })),
      ]),
    [tickets, sent, outbox.entries],
  );
  const columns = groupTickets(shown);

  // --- Bookkeeping ---------------------------------------------------------
  useEffect(() => {
    if (fresh.size === 0) return;
    const timer = window.setTimeout(() => setFresh(new Set()), FRESH_MS);
    return () => window.clearTimeout(timer);
  }, [fresh]);

  // ADR-037: report tickets the moment a started screen has drawn them.
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (!shift.on || document.visibilityState !== "visible") return;
    const ids = tickets.filter((x) => !x.firstSeen && !reported.current.has(x.id)).map((x) => x.id);
    if (ids.length === 0) return;
    for (const id of ids) reported.current.add(id);
    void markTicketsSeen(getBrowserClient(), ids).then((ok) => {
      if (!ok) for (const id of ids) reported.current.delete(id);
    });
  }, [tickets, shift.on]);

  useEffect(() => {
    if (!p.isDevice) return;
    let stopped = false;
    const beat = async () => {
      if ((await heartbeat(getBrowserClient())) === "forbidden" && !stopped) setRevoked(true);
    };
    void beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [p.isDevice]);

  useEffect(() => {
    const { data } = getBrowserClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setRevoked(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // --- Header controls -----------------------------------------------------
  const onSetBusy = useCallback(
    async (minutes: 20 | 30 | 45 | null) => {
      const res = await setKitchenBusy(getBrowserClient(), p.location.id, minutes);
      if (res.ok) setBusy({ until: res.until, minutes: res.until ? minutes : null });
      return res.ok;
    },
    [p.location.id],
  );

  const onToggleSoldOut = useCallback(
    async (itemId: string, out: boolean) => {
      const until = nextBusinessDayStart(new Date(nowRef.current), p.location.timeZone, p.location.businessDayStarts);
      const ok = await setSoldOut(
        getBrowserClient(),
        { restaurantId: p.location.restaurantId, locationId: p.location.id, itemId, userId: p.userId, until },
        out,
      );
      if (ok) {
        setSoldOutIds((prev) => {
          const next = new Set(prev);
          if (out) next.add(itemId);
          else next.delete(itemId);
          return next;
        });
      }
      return ok;
    },
    [p.location, p.userId],
  );

  const clock = formatTime(new Date(now), p.location.timeZone);

  return (
    <div lang={locale} className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-basalt text-slip">
      <header className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-basalt-3 px-4 py-2 lg:gap-x-6 lg:px-6">
        <h1 className="text-[1.875rem] font-bold leading-tight">{p.station.title}</h1>
        {p.otherStations.length > 0 && (
          <nav aria-label={t("stations")} className="flex flex-wrap gap-2">
            {p.otherStations.map((s) => (
              <Link
                key={s.id}
                href={`/kitchen/${s.id}`}
                className="inline-flex min-h-11 items-center rounded-full border border-basalt-3 px-4 text-base font-semibold text-slip-dim"
              >
                {s.title}
              </Link>
            ))}
          </nav>
        )}
        <ConnectionPill state={connection} waiting={outbox.entries.length} lastSyncAt={lastSyncAt} timeZone={p.location.timeZone} />
        <BusySwitch busy={busy} now={now} timeZone={p.location.timeZone} onSet={onSetBusy} />
        <StopList sections={p.dishes} soldOut={soldOutIds} onToggle={onToggleSoldOut} />
        <div className="ml-auto flex items-center gap-4">
          <span data-testid="clock" className="num text-[1.875rem] font-semibold">
            {clock}
          </span>
          {shift.on && (
            <button
              type="button"
              onClick={shift.end}
              className="min-h-11 rounded-full border border-basalt-3 px-4 text-base font-semibold text-slip-dim"
            >
              {t("shift.end")}
            </button>
          )}
        </div>
      </header>

      <main className="grid min-h-0 auto-rows-max gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:grid-rows-[minmax(0,1fr)_auto] sm:overflow-hidden lg:grid-cols-[1fr_1.5fr_0.8fr] lg:grid-rows-[minmax(0,1fr)]">
        {(["new", "cooking", "ready"] as const).map((col) => (
          <BoardColumn
            key={col}
            column={col}
            title={t(`columns.${col}`)}
            empty={t("empty")}
            tickets={columns[col]}
            now={now}
            fresh={fresh}
            onAction={act}
          />
        ))}
      </main>

      {!shift.on && !revoked && <StartShiftOverlay localHour={Number(clock.slice(0, 2))} onStart={shift.start} />}
      {revoked && <DisconnectedScreen />}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
    </div>
  );
}

function BoardColumn({
  column,
  title,
  empty,
  tickets,
  now,
  fresh,
  onAction,
}: {
  column: Column;
  title: string;
  empty: string;
  tickets: ShownTicket[];
  now: number;
  fresh: ReadonlySet<string>;
  onAction: (action: KitchenAction) => void;
}) {
  const strip = column === "ready"; // a horizontal strip under the other two on a portrait tablet
  return (
    <section
      aria-labelledby={`column-${column}`}
      data-testid={`column-${column}`}
      className={clsx("flex min-h-0 flex-col rounded-sheet bg-basalt-2", strip && "sm:col-span-2 lg:col-span-1")}
    >
      <h2 id={`column-${column}`} className="flex justify-between gap-2 px-4 py-3 text-2xl font-bold text-slip-dim">
        <span>{title}</span>
        <b data-testid={`count-${column}`} className="num text-slip">
          {tickets.length}
        </b>
      </h2>
      <div
        className={clsx(
          "flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2 [scrollbar-color:var(--color-basalt-3)_transparent] sm:overflow-y-auto",
          strip && "sm:max-lg:flex-row sm:max-lg:items-start sm:max-lg:overflow-x-auto sm:max-lg:overflow-y-hidden sm:max-lg:*:w-72",
        )}
      >
        {tickets.length === 0 ? (
          <p className="m-0 px-1 py-6 text-xl text-slip-dim">{empty}</p>
        ) : (
          tickets.map((ticket) =>
            ticket.kind === "void" ? (
              <VoidTicketCard key={ticket.id} ticket={ticket} fresh={fresh.has(ticket.id)} onAction={onAction} />
            ) : (
              <OrderTicketCard key={ticket.id} ticket={ticket} column={column} now={now} fresh={fresh.has(ticket.id)} onAction={onAction} />
            ),
          )
        )}
      </div>
    </section>
  );
}
