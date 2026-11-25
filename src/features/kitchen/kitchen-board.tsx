"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clsx } from "clsx";
import { CircleCheck, Flame, Inbox, Power, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/routing";
import { formatTime } from "@/lib/format/date";
import { OutboxProvider, useOutbox } from "@/lib/offline/outbox-provider";
import { useLocationChannel, type LocationMessage } from "@/lib/realtime/use-location-channel";
import { getBrowserClient } from "@/lib/supabase/browser";
import {
  cantMakeItem,
  heartbeat,
  kitchenActionKey,
  kitchenSender,
  markTicketsSeen,
  sameKitchenAction,
  setKitchenBusy,
  setSoldOut,
} from "./actions";
import { ConnectionPill, DisconnectedScreen, Toasts, type Toast } from "./board-chrome";
import { OldestWait } from "./oldest-wait";
import { fetchBusy, fetchSoldOut, fetchTicketRows, type BusyState } from "./board-data";
import { AllDayStrip } from "./all-day";
import { mergeAlert, pruneAlert, type NewOrderAlert } from "./new-order-alert";
import { NewOrderBanner } from "./new-order-banner";
import {
  allDay,
  allLinesStruck,
  applyPending,
  groupTickets,
  lineKey,
  serverSharesStrikes,
  struckLines,
  toBoardTickets,
  type LineDetail,
  type BoardTicket,
  type KitchenAction,
  type ShownTicket,
  type TicketStatus,
} from "./board-model";
import { ChangePassword } from "@/features/staff/change-password";
import { BusySwitch } from "./busy-switch";
import { nextBusinessDayStart } from "./business-day";
import type { SoundId } from "@/lib/sounds/library";
import { connectionState, troubleSince } from "./connection";
import { StartShiftOverlay, useShift } from "./start-shift";
import type { DishSection } from "./station-dishes";
import { IngredientOut } from "./ingredient-out";
import { StopList } from "./stop-list";
import { OrderTicketCard, VoidTicketCard, type Column } from "./ticket-card";
import { useServerClock } from "./use-server-clock";
import { useStruckLines } from "./use-struck-lines";

export type KitchenBoardProps = {
  station: { id: string; title: string };
  otherStations: { id: string; title: string }[];
  location: { id: string; restaurantId: string; timeZone: string; businessDayStarts: string };
  initialTickets: BoardTicket[];
  initialBusy: BusyState;
  initialSoldOut: string[];
  /** The café's sound for a new order (ADR-088); null until its migration is applied: the plain beeps. */
  orderSound?: SoundId | null;
  /** False until the ingredients migration is applied (ADR-076): the button stays hidden. */
  ingredientsSupported: boolean;
  /** False until the can't-make migration is applied (ADR-081): the button stays hidden. */
  cantMakeSupported?: boolean;
  dishes: DishSection[];
  lineDetails: Record<string, LineDetail>; // same-named dishes, by dish id
  renderedAt: number;
  userId: string;
  memberId: string;
  isDevice: boolean;
  canChangePassword?: boolean; // a staff login (ADR-067)
};

const POLL_MS = 10_000; // safety poll under the live channel (realtime.md)
const HEARTBEAT_MS = 60_000;
const TOAST_MS = 6_000;
const FRESH_MS = 1_500;
const LIVE: readonly TicketStatus[] = ["new", "cooking", "ready"];
// The header's round tools (password, end of shift): 48 px, white, one edge.
const TOOL_ICON =
  "bg-basalt-3 text-slip inline-grid size-12 shrink-0 place-items-center rounded-full";

const COLUMN_ICON: Record<"new" | "cooking" | "ready", LucideIcon> = {
  new: Inbox,
  cooking: Flame,
  ready: CircleCheck,
};

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
  const shift = useShift(p.station.id, p.orderSound ?? null);
  const outbox = useOutbox<KitchenAction>();
  const browserOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  const [tickets, setTickets] = useState(p.initialTickets);
  const [busy, setBusy] = useState(p.initialBusy);
  const [soldOutIds, setSoldOutIds] = useState<ReadonlySet<string>>(() => new Set(p.initialSoldOut));
  const [fetchFailed, setFetchFailed] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(p.renderedAt);
  const [sent, setSent] = useState<{ action: KitchenAction; at: number }[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [alert, setAlert] = useState<NewOrderAlert | null>(null);
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

  const pushToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { ...toast, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), TOAST_MS);
  }, []);
  const act = useCallback((action: KitchenAction) => void outbox.enqueue(action), [outbox]);

  // Struck lines (item-level bump, ADR-087): the server's rows are shared by
  // every screen; this screen's own unconfirmed taps sit on top of them.
  const strikes = useStruckLines({
    storageKey: `pativ-kitchen-bumped-${p.station.id}`,
    serverStrikes: serverSharesStrikes(tickets),
    // Another screen struck the other lines a moment ago: this tap finished the ticket.
    onComplete: (ticketId) => {
      if (ticketsRef.current.find((x) => x.id === ticketId)?.status === "cooking") {
        act({ kind: "set_ticket_status", ticketId, expected: "cooking", next: "ready" });
      }
    },
    onFailed: () => pushToast({ tone: "error", title: t("actionFailed") }),
  });
  const { reconcile: reconcileStrikes, flush: flushStrikes } = strikes;

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
        const next = toBoardTickets(res.data, locale, p.lineDetails);
        const arrived = next.filter((x) => !known.current.has(x.id));
        for (const x of next) known.current.add(x.id);
        setTickets(next);
        reconcileStrikes(next, startedAt);
        setFetchFailed(false);
        setLastSyncAt(nowRef.current);
        // Taps already sent are confirmed by any refresh that started after them.
        setSent((list) => list.filter((s) => s.at > startedAt));
        if (arrived.length > 0) {
          setFresh(new Set(arrived.map((x) => x.id)));
          // The big banner stays until a cook taps it; later arrivals join it.
          setAlert((cur) => mergeAlert(pruneAlert(cur, next), arrived));
          // One sound per refresh, the most urgent one: allergy, then a
          // cancellation, then a plain new order.
          const orders = arrived.filter((x) => x.kind === "order" && x.status === "new");
          if (orders.some((x) => x.allergy)) notifyRef.current("allergy");
          else if (arrived.some((x) => x.kind === "void")) notifyRef.current("void");
          else if (orders.length > 0) notifyRef.current("new");
        }
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, [p.station.id, p.lineDetails, locale, reconcileStrikes]);

  const refreshExtras = useCallback(async () => {
    const sb = getBrowserClient();
    const [b, s] = await Promise.all([
      fetchBusy(sb, p.location.id),
      fetchSoldOut(sb, p.location.id, new Date(nowRef.current)),
    ]);
    if (b.ok && b.data === null) setRevoked(true);
    else if (b.ok && b.data) setBusy(b.data);
    if (s.ok) setSoldOutIds(new Set(s.data));
  }, [p.location.id]);

  // Also sends the taps on struck lines the server has not confirmed yet.
  const refreshAll = useCallback(() => {
    flushStrikes();
    void refreshTickets();
    void refreshExtras();
  }, [flushStrikes, refreshTickets, refreshExtras]);

  // Broadcast hints: patch at once, then refetch the truth.
  const onMessage = useCallback(
    (m: LocationMessage) => {
      if (m.event === "ticket") {
        if (m.payload.station_id !== p.station.id) return;
        const id = String(m.payload.id);
        const status = m.payload.status as TicketStatus;
        const gone = !LIVE.includes(status) || m.payload.acknowledged === true;
        setTickets((list) =>
          gone
            ? list.filter((x) => x.id !== id)
            : list.map((x) => (x.id === id && x.kind === "order" ? { ...x, status } : x)),
        );
        void refreshTickets();
      } else if (m.event === "order") {
        if (m.payload.paid === true || m.payload.status === "cancelled") void refreshTickets();
      } else if (m.event === "location") {
        setBusy({
          until: typeof m.payload.kitchen_busy_until === "string" ? m.payload.kitchen_busy_until : null,
          minutes:
            typeof m.payload.expected_wait_minutes === "number" ? m.payload.expected_wait_minutes : null,
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
  const connection = connectionState({
    browserOnline,
    lastFetchFailed: fetchFailed,
    channel,
    troubleSince: trouble,
    now,
  });

  // --- Taps ----------------------------------------------------------------
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

  const shown = useMemo(
    () =>
      applyPending(tickets, [
        ...sent.map((s) => ({ action: s.action, waiting: false })),
        ...outbox.entries.map((e) => ({ action: e.action, waiting: true })),
      ]),
    [tickets, sent, outbox.entries],
  );
  const columns = groupTickets(shown);

  // --- All day and item-level bump ----------------------------------------
  const allDayRows = useMemo(() => allDay(shown), [shown]);
  const [picked, setPicked] = useState<string | null>(null);
  const pickedRow = allDayRows.find((r) => r.key === picked) ?? null;
  const highlighted = useMemo(() => new Set(pickedRow?.ticketIds ?? []), [pickedRow]);

  // The ticket moves to Ready through the usual action once every line is struck.
  const struck = useMemo(() => struckLines(shown, strikes.local), [shown, strikes.local]);
  const setStruck = strikes.set;

  const toggleLine = useCallback(
    (ticket: ShownTicket, lineId: string) => {
      const key = lineKey(ticket.id, lineId);
      const want = !struck.has(key);
      const next = new Set(struck);
      if (want) next.add(key);
      else next.delete(key);
      if (want && allLinesStruck(ticket, next)) {
        // This tap finishes the ticket: it goes to Ready, and the server forgets
        // its strikes then. The last strike is not sent: it could arrive after
        // the move and be refused.
        act({ kind: "set_ticket_status", ticketId: ticket.id, expected: "cooking", next: "ready" });
      } else {
        setStruck(key, want);
      }
    },
    [struck, setStruck, act],
  );

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

  // "Can't make" on one line (ADR-081): needs a connection, says so when it fails.
  const onCantMake = useCallback(
    async (lineId: string) => {
      const res = await cantMakeItem(getBrowserClient(), lineId);
      if (res !== "ok") {
        pushToast({
          tone: res === "stale" ? "conflict" : "error",
          title: t(res === "stale" ? "conflict" : "ticket.cantMakeFailed"),
          detail: res === "paid" ? t("ticket.cantMakePaid") : res === "forbidden" ? t("ticket.cantMakeForbidden") : undefined,
        });
      }
      await refreshTickets();
    },
    [pushToast, refreshTickets, t],
  );

  const onToggleSoldOut = useCallback(
    async (itemId: string, out: boolean) => {
      const until = nextBusinessDayStart(
        new Date(nowRef.current),
        p.location.timeZone,
        p.location.businessDayStarts,
      );
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

  // Orders another screen started or a waiter cancelled leave the banner.
  const shownAlert = useMemo(() => pruneAlert(alert, tickets), [alert, tickets]);

  const clock = formatTime(new Date(now), p.location.timeZone);

  return (
    <div
      lang={locale}
      className={clsx(
        "kitchen-light staff-shell bg-basalt text-slip grid h-dvh grid-cols-[minmax(0,1fr)] overflow-hidden",
        shownAlert ? "grid-rows-[auto_auto_minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]",
      )}
    >
      {/* Two quiet rows: what the station is and how it stands (title, the
          other station, the longest wait, the connection, the clock), then
          the board's tools with the all-day count beside them. */}
      <header className="bg-basalt-2 border-b border-(--kds-frame)">
        <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 lg:px-6">
          <h1 className="m-0 text-[1.75rem] leading-tight font-semibold">{p.station.title}</h1>
          {p.otherStations.length > 0 && (
            <nav aria-label={t("stations")} className="flex flex-wrap gap-2">
              {p.otherStations.map((s) => (
                <Link
                  key={s.id}
                  href={`/kitchen/${s.id}`}
                  className="text-slip-dim inline-flex min-h-12 items-center rounded-xl px-3 text-lg font-semibold underline decoration-(--kds-frame) decoration-2 underline-offset-4"
                >
                  {s.title}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2 max-sm:ml-0 max-sm:justify-start">
            <OldestWait tickets={[...columns.new, ...columns.cooking]} now={now} />
            <ConnectionPill
              state={connection}
              waiting={outbox.entries.length}
              lastSyncAt={lastSyncAt}
              timeZone={p.location.timeZone}
            />
            <span data-testid="clock" className="num text-[2rem] leading-none font-bold">
              {clock}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 px-4 pb-2 lg:px-6">
          {allDayRows.length > 0 && (
            <AllDayStrip
              stationId={p.station.id}
              rows={allDayRows}
              selected={pickedRow?.key ?? null}
              onSelect={setPicked}
            />
          )}
          <div
            role="toolbar"
            aria-label={t("tools")}
            className="order-2 ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 max-sm:ml-0 max-sm:justify-start lg:order-3"
          >
            <BusySwitch busy={busy} now={now} timeZone={p.location.timeZone} onSet={onSetBusy} />
            <StopList sections={p.dishes} soldOut={soldOutIds} onToggle={onToggleSoldOut} />
            {p.ingredientsSupported && <IngredientOut locationId={p.location.id} />}
            {p.canChangePassword && (
              <ChangePassword tone="kitchen" triggerClassName={TOOL_ICON} />
            )}
            {shift.on && (
              <button
                type="button"
                onClick={shift.end}
                aria-label={t("shift.end")}
                title={t("shift.end")}
                className={TOOL_ICON}
              >
                <Power aria-hidden="true" className="size-5 shrink-0" />
              </button>
            )}
          </div>
        </div>
      </header>

      {shownAlert && <NewOrderBanner alert={shownAlert} onAck={() => setAlert(null)} />}

      <main className="grid min-h-0 auto-rows-max grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:grid-rows-[minmax(0,1fr)_auto] sm:overflow-hidden sm:portrait:max-lg:grid-rows-none sm:portrait:max-lg:overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)]">
        {(["new", "cooking", "ready"] as const).map((col) => (
          <BoardColumn
            key={col}
            column={col}
            title={t(`columns.${col}`)}
            empty={t(`columnEmpty.${col}`)}
            tickets={columns[col]}
            now={now}
            fresh={fresh}
            highlighted={highlighted}
            bumped={struck}
            onToggleLine={toggleLine}
            onCantMake={p.cantMakeSupported ? onCantMake : undefined}
            onAction={act}
          />
        ))}
      </main>

      {!shift.on && !revoked && (
        <StartShiftOverlay
          localHour={Number(clock.slice(0, 2))}
          tone={shift.tone}
          onTone={shift.chooseTone}
          onStart={shift.start}
        />
      )}
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
  highlighted,
  bumped,
  onToggleLine,
  onCantMake,
  onAction,
}: {
  column: Column;
  title: string;
  empty: string;
  tickets: ShownTicket[];
  now: number;
  fresh: ReadonlySet<string>;
  highlighted: ReadonlySet<string>;
  bumped: ReadonlySet<string>;
  onToggleLine: (ticket: ShownTicket, lineId: string) => void;
  onCantMake?: (lineId: string) => Promise<void>;
  onAction: (action: KitchenAction) => void;
}) {
  const strip = column === "ready"; // a horizontal strip under the other two on a portrait tablet
  const Icon = COLUMN_ICON[column];
  return (
    <section
      aria-labelledby={`column-${column}`}
      data-testid={`column-${column}`}
      className={clsx(
        // On a portrait tablet the board scrolls as a whole: a column is as tall as its tickets.
        "bg-basalt-2 flex min-h-0 flex-col rounded-2xl sm:portrait:max-lg:min-h-fit",
        strip && "sm:col-span-2 lg:col-span-1",
      )}
    >
      <h2
        id={`column-${column}`}
        className="flex items-center justify-between gap-2 px-4 py-3 text-2xl font-bold"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon
            aria-hidden="true"
            className={clsx(
              "size-7 shrink-0",
              column === "ready" ? "text-tarragon-on-dark" : "text-slip-dim",
            )}
          />
          <span className="min-w-0">{title}</span>
        </span>
        <b
          data-testid={`count-${column}`}
          className="num bg-basalt-4 text-slip grid h-10 min-w-10 place-items-center rounded-full px-2"
        >
          {tickets.length}
        </b>
      </h2>
      <div
        className={clsx(
          "flex min-h-0 flex-1 [scrollbar-color:var(--color-basalt-4)_transparent] flex-col gap-3 px-3 pt-1 pb-3 sm:overflow-y-auto sm:portrait:max-lg:flex-none sm:portrait:max-lg:overflow-y-visible",
          strip &&
            "sm:max-lg:flex-row sm:max-lg:items-start sm:max-lg:overflow-x-auto sm:max-lg:overflow-y-hidden sm:max-lg:*:w-72",
        )}
      >
        {tickets.length === 0 ? (
          <p className="text-slip-dim m-0 grid flex-1 place-items-center px-2 py-6 text-center text-lg">{empty}</p>
        ) : (
          tickets.map((ticket) =>
            ticket.kind === "void" ? (
              <VoidTicketCard
                key={ticket.id}
                ticket={ticket}
                fresh={fresh.has(ticket.id)}
                onAction={onAction}
              />
            ) : (
              <OrderTicketCard
                key={ticket.id}
                ticket={ticket}
                column={column}
                now={now}
                fresh={fresh.has(ticket.id)}
                highlighted={highlighted.has(ticket.id)}
                done={bumped}
                onToggleLine={onToggleLine}
                onCantMake={onCantMake}
                onAction={onAction}
              />
            ),
          )
        )}
      </div>
    </section>
  );
}
