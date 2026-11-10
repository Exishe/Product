"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { heartbeat } from "@/features/kitchen/actions";
import { connectionState, troubleSince } from "@/features/kitchen/connection";
import { useServerClock } from "@/features/kitchen/use-server-clock";
import type { GuestCategory } from "@/features/menu/guest-menu/view-model";
import type { Locale } from "@/i18n/routing";
import type { MemberRole } from "@/lib/auth/membership";
import { formatTime } from "@/lib/format/date";
import { OutboxProvider, useOutbox } from "@/lib/offline/outbox-provider";
import { useLocationChannel } from "@/lib/realtime/use-location-channel";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cancelLine, sameWaiterAction, seatWaitingGuests, settleTable, waiterActionKey, waiterSender, type DirectResult } from "./actions";
import { fetchFloor } from "./floor-data";
import { AreaTabs, FloorMap } from "./floor-map";
import { applyPending, areaOf, buildFloor, needCount, type FloorRows, type FloorTable, type Payment, type WaiterAction } from "./floor-model";
import { OrderPad, type PadOrder } from "./order-pad";
import { SettleSheet } from "./settle";
import { TablePanel } from "./table-panel";
import { ConnectionPill, DisconnectedScreen, Toasts, type Toast } from "./ui";

export type WaiterAppProps = {
  cafeName: string;
  location: { id: string; timeZone: string };
  initialRows: FloorRows;
  menu: GuestCategory[];
  renderedAt: number;
  memberId: string;
  role: MemberRole;
  isDevice: boolean;
  canManageTables: boolean;
};

const POLL_MS = 15_000; // safety poll under the live channel (realtime.md: 15 s on the waiter app)
const HEARTBEAT_MS = 60_000;
const TOAST_MS = 5_000;
const DEBOUNCE_MS = 300;

const client = getBrowserClient as unknown as () => SupabaseClient;

// The waiter app (screens.md §5–6, design/waiter.html). Server-rendered with the
// floor, then kept live: Broadcast hints trigger a debounced refetch, a 15-second
// poll covers a dead socket, and taps go through the offline outbox.
export function WaiterApp(props: WaiterAppProps) {
  const send = useMemo(() => waiterSender(getBrowserClient), []);
  return (
    <OutboxProvider name={`pativ-waiter-outbox-${props.memberId}`} send={send} sameAction={sameWaiterAction} groupKey={waiterActionKey}>
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

type Sheet = { kind: "pad"; tableId: string } | { kind: "settle"; tableId: string; sessionId: string; key: string } | null;

function App(p: WaiterAppProps) {
  const t = useTranslations("waiter");
  const locale = useLocale() as Locale;
  const now = useServerClock(p.renderedAt);
  const outbox = useOutbox<WaiterAction>();
  const browserOnline = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  const [rows, setRows] = useState(p.initialRows);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(p.renderedAt);
  const [sent, setSent] = useState<{ action: WaiterAction; at: number }[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [revoked, setRevoked] = useState(false);
  const [trouble, setTrouble] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [area, setArea] = useState<string | null | undefined>(undefined);
  const [sheet, setSheet] = useState<Sheet>(null);

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
  const connection = connectionState({ browserOnline, lastFetchFailed: fetchFailed, channel, troubleSince: trouble, now });
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
  const tablesRef = useRef(tables);
  useEffect(() => {
    tablesRef.current = tables;
  });

  const currentArea = area !== undefined && floor.areas.some((a) => a.id === area) ? area : (floor.areas[0]?.id ?? null);
  const areaTables = tables.filter((x) => areaOf(x, floor.areas) === currentArea);
  const table = tables.find((x) => x.id === selected) ?? null;

  // --- Taps ---------------------------------------------------------------------
  const orderNumber = (orderId: string) =>
    tablesRef.current.flatMap((x) => [...x.orders, ...(x.waiting?.orders ?? [])]).find((o) => o.id === orderId)?.number ?? null;

  useEffect(
    () =>
      outbox.subscribe((e) => {
        if (e.type === "sent") {
          setSent((list) => [...list, { action: e.entry.action, at: performance.now() }]);
          void refresh();
        } else if (e.type === "stale") {
          // Someone else acted first (Review focus 4): say so, show the truth.
          const text =
            e.current === "table_needs_closing" ? t("needsClosing") : e.current === "served" ? t("alreadyServed") : t("conflict");
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
        if (number !== null) pushToast(action.kind === "accept" ? t("order.accepted", { number }) : t("order.rejectedToast", { number }));
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
  const sheetTable = sheet ? tables.find((x) => x.id === sheet.tableId) : null;

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-matsoni">
      <header className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-white px-4 py-2 lg:px-6">
        <h1 className="display-face m-0 mr-2 text-2xl">{p.cafeName}</h1>
        <AreaTabs areas={floor.areas} current={currentArea} onPick={(id) => setArea(id)} />
        <span data-testid="need" className="ml-auto font-semibold">
          {need > 0 ? t("need", { count: need }) : t("allServed")}
        </span>
        <ConnectionPill state={connection} waiting={outbox.entries.length} />
        <span data-testid="clock" className="num text-xl font-semibold">
          {formatTime(new Date(now), p.location.timeZone)}
        </span>
      </header>
      {connection === "offline" ? (
        <p role="alert" data-testid="offline-banner" className="m-0 bg-pomegranate px-4 py-2 font-semibold text-white lg:px-6">
          {t("connection.banner", { time: formatTime(new Date(lastSyncAt), p.location.timeZone) })}
        </p>
      ) : (
        <span />
      )}

      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] md:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_26.25rem]">
        <div className="grid min-h-0 p-4 lg:p-6">
          {tables.length === 0 ? (
            <div className="grid content-start gap-3">
              <p className="m-0 text-lg">{t("noTables")}</p>
              {p.canManageTables && (
                <Link href="/admin/tables" className="font-semibold text-tarragon underline">
                  {t("noTablesLink")}
                </Link>
              )}
            </div>
          ) : (
            <FloorMap tables={areaTables} selected={selected} onSelect={setSelected} />
          )}
        </div>
        <aside
          aria-label={table ? t("panel.table", { label: table.label }) : undefined}
          data-testid="panel"
          className="flex min-h-0 min-w-0 flex-col border-t border-line bg-white md:border-t-0 md:border-l"
        >
          {table ? (
            <TablePanel
              key={table.id}
              table={table}
              role={p.role}
              onAction={act}
              onOpenPad={() => setSheet({ kind: "pad", tableId: table.id })}
              onSettle={(sessionId) => setSheet({ kind: "settle", tableId: table.id, sessionId, key: crypto.randomUUID() })}
              onSeatWaiting={(id) => void onSeatWaiting(id)}
              onCancelLine={onCancelLine}
            />
          ) : (
            <p className="m-0 p-6 text-muted">{t("panel.pick")}</p>
          )}
        </aside>
      </div>

      {sheet?.kind === "pad" && sheetTable && (
        <OrderPad label={sheetTable.label} categories={p.menu} onClose={() => setSheet(null)} onSend={(o) => onSend(sheetTable, o)} />
      )}
      {sheet?.kind === "settle" && sheetTable && (
        <SettleSheet
          label={sheetTable.label}
          total={sheetTable.total}
          oldBill={sheetTable.waiting !== null}
          online={online}
          onClose={() => setSheet(null)}
          onConfirm={(payments) => onSettle(sheetTable, sheet.sessionId, sheet.key, payments)}
        />
      )}
      {revoked && <DisconnectedScreen />}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
    </div>
  );
}
