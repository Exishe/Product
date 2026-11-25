"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clsx } from "clsx";
import { BellRing, CircleCheck, ClipboardList, CloudUpload, LayoutGrid, Megaphone, Wallet, WifiOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { WaiterAlerts } from "@/features/alerts/waiter-alerts";
import { heartbeat } from "@/features/kitchen/actions";
import { connectionState, troubleSince } from "@/features/kitchen/connection";
import { useServerClock } from "@/features/kitchen/use-server-clock";
import { ChangePassword } from "@/features/staff/change-password";
import type { GuestCategory } from "@/features/menu/guest-menu/view-model";
import type { Locale } from "@/i18n/routing";
import type { MemberRole } from "@/lib/auth/membership";
import { formatTime } from "@/lib/format/date";
import { OutboxProvider, useOutbox } from "@/lib/offline/outbox-provider";
import { useLocationChannel } from "@/lib/realtime/use-location-channel";
import { DEFAULT_CALL_SOUND, soundOr } from "@/lib/sounds/library";
import { getBrowserClient } from "@/lib/supabase/browser";
import {
  ackCantMake,
  cancelLine,
  sameWaiterAction,
  seatWaitingGuests,
  settleTable,
  waiterActionKey,
  waiterSender,
  type DirectResult,
} from "./actions";
import { openRequests, type AlertRequest } from "./call-alerts";
import { CallBanners, SoundButton } from "./call-banners";
import { fetchFloor } from "./floor-data";
import { fetchLivePromoTitles } from "./promos";
import { fetchRewards, resolveReward, type WaiterReward } from "./rewards";
import { AreaTabs, FloorMap } from "./floor-map";
import { InboxList } from "./inbox-list";
import { WaiterAlert } from "./live-alert";
import type { AlertKind } from "./live-alert-model";
import {
  applyPending,
  areaOf,
  buildFloor,
  inbox,
  needCount,
  tableOfAction,
  type FloorRows,
  type FloorTable,
  type Payment,
  type WaiterAction,
} from "./floor-model";
import { NotifyToggle } from "./notify-toggle";
import { OrderPad, type PadOrder } from "./order-pad";
import { QueueSheet, type SentTap } from "./queue-sheet";
import { SettleSheet } from "./settle";
import { ShiftSheet } from "./shift-sheet";
import { TablePanel } from "./table-panel";
import { TabBar } from "./tab-bar";
import { useCallAlerts } from "./use-call-alerts";
import { ConnectionPill, DisconnectedScreen, Toasts, type Toast } from "./ui";

// The live card announces plates and new orders; calls and bills ring in their own banners.
const LIVE_ALERT_KINDS: readonly AlertKind[] = ["ready", "new"];

export type WaiterAppProps = {
  cafeName: string;
  location: { id: string; timeZone: string; dayStartsAt: string };
  initialRows: FloorRows;
  menu: GuestCategory[];
  renderedAt: number;
  memberId: string;
  restaurantId: string;
  /** For «Ծանուցումներ այս սարքում» (ADR-049); null where web push is not set up. */
  vapidPublicKey: string | null;
  role: MemberRole;
  isDevice: boolean;
  canChangePassword?: boolean; // a staff login (ADR-067)
  canManageTables: boolean;
  /** Titles of the promos guests see now (ADR-070); the waiter applies the discount. */
  initialPromos?: string[];
  /** The café's sound for a guest call (ADR-088); null before its migration: the default. */
  callSound?: string | null;
};

const POLL_MS = 15_000; // safety poll under the live channel (realtime.md: 15 s on the waiter app)
const HEARTBEAT_MS = 60_000;
const TOAST_MS = 5_000;
const DEBOUNCE_MS = 300;

const client = getBrowserClient as unknown as () => SupabaseClient;

// Every round control in the header: 44 px, white, a hairline edge.
const HEADER_ICON =
  "border-staff-sep text-ink grid size-11 shrink-0 place-items-center rounded-full border bg-white";

// The waiter app (screens.md §5–6, design/waiter.html). Server-rendered with the
// floor, then kept live: Broadcast hints trigger a debounced refetch, a 15-second
// poll covers a dead socket, and taps go through the offline outbox.
export function WaiterApp(props: WaiterAppProps) {
  const send = useMemo(() => waiterSender(getBrowserClient), []);
  return (
    <OutboxProvider
      name={`pativ-waiter-outbox-${props.memberId}`}
      send={send}
      sameAction={sameWaiterAction}
      groupKey={waiterActionKey}
    >
      <App {...props} />
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

type Tab = "tables" | "orders" | "calls";

type Sheet =
  | { kind: "pad"; tableId: string }
  | { kind: "settle"; tableId: string; sessionId: string; key: string }
  | { kind: "queue" }
  | { kind: "shift" }
  | null;

const RECENT_SENT = 5;

function App(p: WaiterAppProps) {
  const t = useTranslations("waiter");
  const locale = useLocale() as Locale;
  const now = useServerClock(p.renderedAt);
  const outbox = useOutbox<WaiterAction>();
  const browserOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  const [rows, setRows] = useState(p.initialRows);
  const [promos, setPromos] = useState(p.initialPromos ?? []);
  const [rewards, setRewards] = useState<WaiterReward[]>([]);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(p.renderedAt);
  const [sent, setSent] = useState<{ action: WaiterAction; at: number }[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [revoked, setRevoked] = useState(false);
  const [trouble, setTrouble] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [area, setArea] = useState<string | null | undefined>(undefined);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [tab, setTab] = useState<Tab>("tables");
  const [recent, setRecent] = useState<SentTap[]>([]);

  // Promos switch on and off during service: look again every 30 s while visible.
  useEffect(() => {
    const look = async () => {
      if (document.hidden) return;
      const titles = await fetchLivePromoTitles(client(), p.location.id, locale);
      if (titles) setPromos((old) => (JSON.stringify(old) === JSON.stringify(titles) ? old : titles));
    };
    const timer = setInterval(() => void look(), 30_000);
    document.addEventListener("visibilitychange", look);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
  }, [p.location.id, locale]);

  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  // --- Reading ---------------------------------------------------------------
  const inFlight = useRef(false);
  const again = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const startedAt = performance.now();
        const res = await fetchFloor(getBrowserClient(), p.location.id);
        if (!res.ok) {
          setFetchFailed(true);
          return;
        }
        if (res.data === null) {
          setRevoked(true);
          return;
        }
        setRows(res.data);
        // Open game rewards (ADR-075): a failed read keeps what is shown.
        void fetchRewards(getBrowserClient(), p.location.id).then((r) => r && setRewards(r));
        setFetchFailed(false);
        setLastSyncAt(nowRef.current);
        // Taps already sent are confirmed by any refresh that started after them.
        setSent((list) => list.filter((s) => s.at > startedAt));
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, [p.location.id]);

  // A burst of hints (an order makes several) becomes one request.
  const timer = useRef<number | undefined>(undefined);
  const refreshSoon = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void refresh(), DEBOUNCE_MS);
  }, [refresh]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const channel = useLocationChannel(client, p.location.id, refreshSoon);
  useEffect(() => {
    if (channel === "subscribed") void refresh();
  }, [channel, refresh]);

  useEffect(() => {
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const onOnline = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // --- Connection --------------------------------------------------------------
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
  const online = browserOnline && !fetchFailed;

  // --- Toasts -------------------------------------------------------------------
  const pushToast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  // --- Floor ------------------------------------------------------------------
  const floor = useMemo(() => buildFloor(rows, locale, now), [rows, locale, now]);
  const tables = useMemo(
    () =>
      applyPending(floor.tables, [
        ...sent.map((s) => ({ action: s.action, waiting: false })),
        ...outbox.entries.map((e) => ({ action: e.action, waiting: true })),
      ]),
    [floor.tables, sent, outbox.entries],
  );
  // Calls and bill requests: sound, vibration, banners (ADR-088). The list is
  // the one the tiles show, so an answered call leaves it at once.
  const requests = useMemo(() => openRequests(tables, now), [tables, now]);
  const alertText = useCallback(
    (r: AlertRequest) => ({
      title: t(r.kind === "call" ? "alerts.call" : "alerts.bill", { label: r.label }),
      body: t("alerts.notificationBody"),
    }),
    [t],
  );
  const alerts = useCallAlerts({
    requests,
    callSound: soundOr(p.callSound, DEFAULT_CALL_SOUND),
    texts: alertText,
  });
  const tablesRef = useRef(tables);
  const floorTablesRef = useRef(floor.tables);
  useEffect(() => {
    tablesRef.current = tables;
    floorTablesRef.current = floor.tables;
  });
  // Which tables have a tap still waiting here: a dot on their tile.
  const pendingTables = useMemo(
    () =>
      new Set(
        outbox.entries.flatMap((e) => {
          const owner = tableOfAction(floor.tables, e.action);
          return owner ? [owner.id] : [];
        }),
      ),
    [outbox.entries, floor.tables],
  );
  const labelOf = (action: WaiterAction) => tableOfAction(floor.tables, action)?.label ?? null;

  const currentArea =
    area !== undefined && floor.areas.some((a) => a.id === area) ? area : (floor.areas[0]?.id ?? null);
  const areaTables = tables.filter((x) => areaOf(x, floor.areas) === currentArea);
  const table = tables.find((x) => x.id === selected) ?? null;

  // --- Taps ---------------------------------------------------------------------
  const orderNumber = (orderId: string) =>
    tablesRef.current
      .flatMap((x) => [...x.orders, ...(x.waiting?.orders ?? [])])
      .find((o) => o.id === orderId)?.number ?? null;

  useEffect(
    () =>
      outbox.subscribe((e) => {
        if (e.type === "sent") {
          setSent((list) => [...list, { action: e.entry.action, at: performance.now() }]);
          const label = tableOfAction(floorTablesRef.current, e.entry.action)?.label ?? null;
          setRecent((list) =>
            [{ id: e.entry.id, action: e.entry.action, label, at: Date.now() }, ...list].slice(
              0,
              RECENT_SENT,
            ),
          );
          void refresh();
        } else if (e.type === "stale") {
          // Someone else acted first (Review focus 4): say so, show the truth.
          const text =
            e.current === "table_needs_closing"
              ? t("needsClosing")
              : e.current === "served"
                ? t("alreadyServed")
                : t("conflict");
          pushToast(text, "conflict");
          void refresh();
        } else if (e.type === "failed") {
          pushToast(t("actionFailed"), "error");
          void refresh();
        } else if (e.type === "forbidden") {
          setRevoked(true);
        }
      }),
    [outbox, refresh, pushToast, t],
  );

  const act = useCallback(
    (action: WaiterAction) => {
      if (action.kind === "accept" || action.kind === "reject") {
        const number = orderNumber(action.orderId);
        if (number !== null)
          pushToast(
            action.kind === "accept" ? t("order.accepted", { number }) : t("order.rejectedToast", { number }),
          );
      }
      void outbox.enqueue(action);
    },
    [outbox, pushToast, t],
  );

  const onSend = (tableRow: FloorTable, order: PadOrder) => {
    act({ kind: "place", key: crypto.randomUUID(), tableId: tableRow.id, locale, ...order });
    setSheet(null);
    pushToast(navigator.onLine ? t("pad.sent", { label: tableRow.label }) : t("pad.queued"));
  };

  const direct = useCallback(
    async (res: DirectResult) => {
      if (!res.ok && res.reason === "stale") pushToast(t("conflict"), "conflict");
      if (!res.ok && res.reason === "refused") pushToast(t("actionFailed"), "error");
      if (!res.ok && res.reason === "forbidden") void refresh();
      await refresh();
      return res;
    },
    [pushToast, refresh, t],
  );

  const onCancelLine = async (lineId: string, quantity: number, reason: string) => {
    const res = await cancelLine(getBrowserClient(), lineId, quantity, reason);
    if (res.ok) pushToast(t("cancel.done"));
    if (!res.ok && (res.reason === "forbidden" || res.reason === "network")) return res;
    return direct(res);
  };

  const onSettle = async (tableRow: FloorTable, sessionId: string, key: string, payments: Payment[]) => {
    const res = await settleTable(getBrowserClient(), sessionId, payments, key);
    if (!res.ok && res.reason === "network") return res;
    if (res.ok) {
      pushToast(t("settle.closed", { label: tableRow.label }));
      setSheet(null);
    } else {
      setSheet(null);
    }
    return direct(res);
  };

  // "Applied" or "Dismiss" on a game reward: gone from the list at once, back
  // if the database refuses.
  const onReward = async (id: string, action: "applied" | "dismissed") => {
    const before = rewards;
    setRewards((list) => list.filter((r) => r.id !== id));
    const res = await resolveReward(getBrowserClient(), id, action);
    if (!res.ok && res.reason !== "stale") setRewards(before);
    if (res.ok || res.reason === "stale") void refresh();
    return res;
  };

  // "Told the guest": the alert goes at once on the next read; a failure shows the usual message.
  const onAckCantMake = async (lineId: string) => {
    const res = await ackCantMake(getBrowserClient(), lineId);
    if (!res.ok && (res.reason === "forbidden" || res.reason === "network")) return res;
    return direct(res);
  };

  const onSeatWaiting = async (waitingSessionId: string) => {
    await direct(await seatWaitingGuests(getBrowserClient(), waitingSessionId));
  };

  // --- Device bookkeeping --------------------------------------------------------
  useEffect(() => {
    if (!p.isDevice) return;
    let stopped = false;
    const beat = async () => {
      if ((await heartbeat(getBrowserClient())) === "forbidden" && !stopped) setRevoked(true);
    };
    void beat();
    const id = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [p.isDevice]);

  useEffect(() => {
    const { data } = getBrowserClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setRevoked(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const need = needCount(tables);
  const sheetTable = sheet && "tableId" in sheet ? tables.find((x) => x.id === sheet.tableId) : null;
  const openSettle = (tableId: string, sessionId: string) =>
    setSheet({ kind: "settle", tableId, sessionId, key: crypto.randomUUID() });
  const lists = useMemo(() => inbox(tables, now), [tables, now]);

  // Phones show the map or one table (a pushed screen with a back button);
  // from 768 px the table sits beside the map (split view).
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const openTable = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 767px)").matches)
      requestAnimationFrame(() => panelHeading.current?.focus());
  };
  const closeTable = () => {
    const id = selected;
    setSelected(null);
    requestAnimationFrame(() => document.getElementById(`table-${id}`)?.focus());
  };

  const tabTitle = t(`tabs.${tab}`);

  return (
    <div className="staff-shell bg-staff-bg text-ink grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      {/* Phones: the café and the clock, then the status and the tools on a
          second row. From 640 px it is one row. The calls ring underneath,
          one 56 px row on a phone, so a table's screen keeps its room. */}
      <header className="bg-staff-bg grid gap-2 px-4 pt-2 pb-2 lg:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="m-0 min-w-[6rem] flex-1 truncate text-[0.9375rem] leading-tight font-semibold">
            {p.cafeName}
          </p>
          <span data-testid="clock" className="num shrink-0 text-[1.0625rem] font-semibold sm:order-last sm:pl-1">
            {formatTime(new Date(now), p.location.timeZone)}
          </span>
          <div className="flex min-w-0 items-center gap-2 max-sm:basis-full">
            <ConnectionPill state={connection} />
            {/* The outbox stays visible until it is empty, online or not: a waiter
                who can't see a queued order enters it again. */}
            {outbox.entries.length > 0 && (
              <button
                type="button"
                data-testid="queue-chip"
                onClick={() => setSheet({ kind: "queue" })}
                className="bg-amber text-ink inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.875rem] font-semibold"
              >
                <CloudUpload aria-hidden="true" className="size-4 shrink-0" />
                <span className="num">{t("queue.chip", { count: outbox.entries.length })}</span>
              </button>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SoundButton
                on={alerts.soundOn}
                onTap={alerts.enableSound}
                warn={requests.length > 0}
              />
              <NotifyToggle restaurantId={p.restaurantId} vapidPublicKey={p.vapidPublicKey} locale={locale} />
              {p.canChangePassword && (
                <ChangePassword tone="staff" triggerClassName={HEADER_ICON} />
              )}
              <button
                type="button"
                data-testid="shift-open"
                aria-label={t("shift.open")}
                title={t("shift.open")}
                onClick={() => setSheet({ kind: "shift" })}
                className={HEADER_ICON}
              >
                <Wallet aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>
        </div>
        <CallBanners
          requests={requests}
          state={alerts.state}
          played={alerts.played}
          onGoing={(r) => {
            act({ kind: "resolve", requestId: r.id });
            alerts.close(r.id);
          }}
          onOpenTable={(r) => {
            setTab("tables");
            openTable(r.tableId);
            alerts.close(r.id);
          }}
          onClose={alerts.close}
          onOpenCalls={() => {
            setSelected(null);
            setTab("calls");
          }}
        />
      </header>
      {connection === "offline" ? (
        <p
          role="alert"
          data-testid="offline-banner"
          className="bg-pomegranate m-0 flex items-start gap-2 px-4 py-2 text-[0.9375rem] font-semibold text-white lg:px-6"
        >
          <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("connection.banner", { time: formatTime(new Date(lastSyncAt), p.location.timeZone) })}
        </p>
      ) : (
        <span />
      )}

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:grid-cols-[minmax(0,1fr)_26.25rem]">
        <div
          className={clsx(
            "grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[7rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]",
            table && "max-md:hidden",
          )}
        >
          <main className="grid min-h-0 auto-rows-max grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-4 pt-3 pb-6 lg:col-start-2 lg:row-start-1 lg:px-6">
            {/* The tab bar names the section; on a phone the title is for screen readers only. */}
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="m-0 text-[1.375rem] leading-tight font-semibold max-md:sr-only">{tabTitle}</h1>
              <p
                data-testid="need"
                className={clsx(
                  "m-0 flex items-center gap-1.5 text-[0.9375rem] font-semibold",
                  need > 0 ? "text-amber-text" : "text-tarragon",
                )}
              >
                {need > 0 ? (
                  <BellRing aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
                )}
                {need > 0 ? t("need", { count: need }) : t("allServed")}
              </p>
            </div>
            {promos.length > 0 && (
              <p
                data-testid="promo-line"
                className="bg-tarragon-tint text-tarragon m-0 flex items-start gap-2 rounded-xl px-3 py-2 text-[0.9375rem] leading-snug font-semibold [overflow-wrap:anywhere]"
              >
                <Megaphone aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{t("promoOn", { count: promos.length, titles: promos.join(" · ") })}</span>
              </p>
            )}
            <WaiterAlerts locationId={p.location.id} />
            {tab === "tables" &&
              (tables.length === 0 ? (
                <div className="grid content-start gap-3 rounded-2xl bg-white p-4">
                  <p className="m-0 text-[1.0625rem]">{t("noTables")}</p>
                  {p.canManageTables && (
                    <Link href="/admin/tables" className="text-ink font-semibold underline">
                      {t("noTablesLink")}
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <AreaTabs areas={floor.areas} current={currentArea} onPick={(id) => setArea(id)} />
                  <FloorMap
                    tables={areaTables}
                    selected={selected}
                    onSelect={openTable}
                    now={now}
                    pendingTables={pendingTables}
                  />
                </>
              ))}
            {tab === "orders" && (
              <InboxList
                rows={lists.orders}
                empty={t("inbox.ordersEmpty")}
                selected={selected}
                onSelect={openTable}
                onAction={act}
                onSettle={openSettle}
              />
            )}
            {tab === "calls" && (
              <InboxList
                rows={lists.calls}
                empty={t("inbox.callsEmpty")}
                selected={selected}
                onSelect={openTable}
                onAction={act}
                onSettle={openSettle}
              />
            )}
          </main>
          <TabBar
            current={tab}
            onPick={setTab}
            items={[
              { key: "tables", icon: LayoutGrid, badge: 0 },
              { key: "orders", icon: ClipboardList, badge: lists.orders.length },
              { key: "calls", icon: BellRing, badge: lists.calls.length },
            ]}
          />
        </div>
        <aside
          aria-label={table ? t("panel.table", { label: table.label }) : undefined}
          data-testid="panel"
          className={clsx(
            "md:border-staff-sep flex min-h-0 min-w-0 flex-col md:border-l",
            table ? "bg-white" : "bg-staff-bg",
            !table && "max-md:hidden",
          )}
        >
          {table ? (
            <TablePanel
              key={table.id}
              table={table}
              role={p.role}
              headingRef={panelHeading}
              onBack={closeTable}
              onAction={act}
              onOpenPad={() => setSheet({ kind: "pad", tableId: table.id })}
              onSettle={(sessionId) => openSettle(table.id, sessionId)}
              onSeatWaiting={(id) => void onSeatWaiting(id)}
              onCancelLine={onCancelLine}
              rewards={rewards.filter((r) => r.tableId === table.id)}
              onReward={onReward}
              onAckCantMake={onAckCantMake}
              now={now}
              timeZone={p.location.timeZone}
            />
          ) : tab === "tables" ? (
            // Nothing picked: what needs doing now, the Orders and Calls lists in one.
            <section aria-labelledby="now-title" className="grid min-h-0 content-start gap-3 overflow-y-auto p-4 lg:p-6">
              <h2 id="now-title" className="m-0 text-[1.0625rem] font-semibold">
                {t("panel.now")}
              </h2>
              <InboxList
                rows={[...lists.calls, ...lists.orders]}
                empty={t("panel.allClear")}
                selected={selected}
                onSelect={openTable}
                onAction={act}
                onSettle={openSettle}
              />
            </section>
          ) : (
            <p className="text-staff-label2 m-0 p-6 text-[0.9375rem]">{t("panel.pick")}</p>
          )}
        </aside>
      </div>

      {sheet?.kind === "pad" && sheetTable && (
        <OrderPad
          label={sheetTable.label}
          categories={p.menu}
          onClose={() => setSheet(null)}
          onSend={(o) => onSend(sheetTable, o)}
        />
      )}
      {sheet?.kind === "settle" && sheetTable && (
        <SettleSheet
          label={sheetTable.label}
          total={sheetTable.total}
          oldBill={sheetTable.waiting !== null}
          preferred={sheetTable.bill?.payment ?? null}
          online={online}
          rewards={rewards.filter((r) => r.tableId === sheetTable.id)}
          onReward={onReward}
          onClose={() => setSheet(null)}
          onConfirm={(payments) => onSettle(sheetTable, sheet.sessionId, sheet.key, payments)}
        />
      )}
      {sheet?.kind === "queue" && (
        <QueueSheet
          entries={outbox.entries}
          sent={recent}
          labelOf={labelOf}
          timeZone={p.location.timeZone}
          onRetry={outbox.retry}
          onDiscard={outbox.discard}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "shift" && (
        <ShiftSheet
          locationId={p.location.id}
          memberId={p.memberId}
          timeZone={p.location.timeZone}
          dayStartsAt={p.location.dayStartsAt}
          onClose={() => setSheet(null)}
        />
      )}
      {revoked && <DisconnectedScreen />}
      {/* Calls and bills ring in the banners above until answered; this card adds plates and new orders. */}
      {!revoked && <WaiterAlert tables={floor.tables} onOpen={openTable} kinds={LIVE_ALERT_KINDS} />}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
    </div>
  );
}
