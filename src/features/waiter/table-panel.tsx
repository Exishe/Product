"use client";

import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  ChevronLeft,
  CircleAlert,
  CircleDashed,
  Clock,
  Copy,
  Ellipsis,
  HandPlatter,
  Minus,
  Plus,
  Receipt,
  SquarePen,
  Users,
  X,
} from "lucide-react";
import { useId, useState, type RefObject } from "react";
import type { Locale } from "@/i18n/routing";
import type { MemberRole } from "@/lib/auth/membership";
import { formatAmd } from "@/lib/format/money";
import type { DirectResult } from "./actions";
import {
  closeBlocker,
  tileAge,
  type FloorTable,
  type WaiterAction,
  type WaiterLine,
  type WaiterOrder,
} from "./floor-model";
import { PrintTicketButton, TicketSheet } from "../print-ticket/print-ticket";
import { StateIcon } from "./floor-map";
import { TableTimeline } from "./table-timeline";
import { CantMakeCards } from "./cant-make-card";
import { RewardCards } from "./reward-card";
import { PosOrderStatus } from "../pos/pos-order-status";
import type { WaiterPosSend } from "../pos/waiter-pos";
import type { WaiterReward } from "./rewards";
import { button, chip, choice, Sheet } from "./ui";

export type PanelProps = {
  table: FloorTable;
  role: MemberRole;
  onAction: (action: WaiterAction) => void;
  onOpenPad: () => void;
  onSettle: (sessionId: string) => void;
  onSeatWaiting: (waitingSessionId: string) => void;
  onCancelLine: (lineId: string, quantity: number, reason: string) => Promise<DirectResult>;
  /** Open game rewards of this table (ADR-075) and the waiter's answer. */
  rewards: WaiterReward[];
  onReward: (id: string, action: "applied" | "dismissed") => Promise<DirectResult>;
  /** "Told the guest" on a dish the kitchen could not make (ADR-081). */
  onAckCantMake: (lineId: string) => Promise<DirectResult>;
  /** The POS send of each order, when the café's POS is connected (ADR-093). */
  posSends?: Record<string, WaiterPosSend>;
  onPosRetry?: (id: number) => Promise<{ ok: boolean }>;
  /** Back to the map on phones (the panel is a pushed screen there). */
  onBack: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  now: number;
  timeZone: string;
};

// The right-hand panel (screens.md §6, design/waiter.html): alerts, the
// table's rounds newest first, and the actions that apply.
export function TablePanel({ headingRef, ...p }: PanelProps) {
  const t = useTranslations("waiter");
  const locale = useLocale() as Locale;
  const [rejecting, setRejecting] = useState<WaiterOrder | null>(null);
  const [cancelling, setCancelling] = useState<WaiterLine | null>(null);
  const { table } = p;
  const blocker = closeBlocker(table);
  const title = t("panel.table", { label: table.label });
  const age = tileAge(table, p.now);

  const nav = (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={p.onBack}
        className="text-ink -ml-2 inline-flex min-h-12 items-center gap-1 justify-self-start rounded-xl px-2 text-[1.0625rem] font-semibold md:hidden"
      >
        <ChevronLeft aria-hidden="true" className="size-6" />
        {t("tabs.tables")}
      </button>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="m-0 text-[1.75rem] leading-tight font-bold [overflow-wrap:anywhere]"
      >
        {title}
      </h2>
    </div>
  );

  if (table.state === "free" && table.orders.length === 0) {
    return (
      <>
        <div className="grid flex-1 content-start gap-3 overflow-y-auto bg-white px-4 pt-3 pb-6 lg:px-6">
          {nav}
          <p className="text-staff-label2 m-0 flex items-center gap-2 text-[1.0625rem] font-semibold">
            <CircleDashed aria-hidden="true" className="size-5 shrink-0" />
            {t("panel.free")}
          </p>
          <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("panel.freeHint")}</p>
        </div>
        <div className="border-staff-sep grid border-t bg-white px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] lg:px-6">
          <button type="button" className={button("primary", "min-h-14")} onClick={p.onOpenPad}>
            <SquarePen aria-hidden="true" />
            {t("panel.takeOrder")}
          </button>
        </div>
      </>
    );
  }

  // A guest's order waits to be accepted: the bar at the bottom accepts the
  // oldest one, so the one job is under the thumb, not below the fold.
  const placed = table.orders.filter((o) => o.status === "placed");
  const pendingOrder = placed.at(-1) ?? null;
  const pendingAmount = placed.reduce((s, o) => s + o.total, 0);
  // Food on the pass comes before the bill: while a plate waits to be served,
  // «Նշել մատուցված» is the one filled button and the close steps back.
  const toServe = table.orders.some(
    (o) => o.status === "accepted" && o.number !== null && o.tickets.some((k) => k.status === "ready"),
  );
  // Nothing confirmed yet, only a guest's order waiting: the waiting amount is
  // the figure, in amber under its own label, never a big «0 ֏».
  const onlyPending = table.total === 0 && pendingAmount > 0;

  // Requests and notices are rows across the whole panel, tinted, never boxes.
  const BLEED = "-mx-4 px-4 lg:-mx-6 lg:px-6";

  return (
    <>
      <div className="grid flex-1 content-start gap-5 overflow-y-auto bg-white px-4 pt-3 pb-6 *:min-w-0 lg:px-6">
        <div className="grid gap-1">
          {nav}
          {table.openMinutes !== null && (
            <p className="text-staff-label2 m-0 flex items-center gap-1.5 text-[0.9375rem]">
              <Clock aria-hidden="true" className="size-4 shrink-0" />
              <span className="num">{t("panel.openFor", { minutes: table.openMinutes })}</span>
            </p>
          )}
        </div>

        <CantMakeCards
          items={table.orders.flatMap((o) =>
            o.lines.filter((l) => l.cantMakePending).map((l) => ({ id: l.id, name: l.name.text })),
          )}
          onAck={p.onAckCantMake}
        />

        <RewardCards rewards={p.rewards} onResolve={p.onReward} />

        {(age?.kind === "quiet" || table.call || table.bill) && (
          <div className="grid gap-px">
            {age?.kind === "quiet" && (
              <p
                data-testid="quiet-alert"
                className={clsx(
                  BLEED,
                  "bg-amber-tint text-amber-text m-0 flex min-h-14 items-center gap-2 py-2 text-[1.0625rem] font-semibold",
                )}
              >
                <Clock aria-hidden="true" className="size-5 shrink-0" />
                {t("timeline.quiet", { minutes: age.minutes })}
              </p>
            )}
            {table.call && (
              <div
                data-testid="call-alert"
                className={clsx(
                  BLEED,
                  "bg-pom-tint text-pomegranate flex min-h-14 items-center justify-between gap-3 py-1.5 text-[1.0625rem] font-semibold",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className="bg-pomegranate size-2.5 shrink-0 rounded-full" />
                  {table.call.minutes > 0
                    ? t("panel.callAgo", { minutes: table.call.minutes })
                    : t("panel.callNow")}
                </span>
                <button
                  type="button"
                  className={button("destructive", "flex-none")}
                  onClick={() => table.call && p.onAction({ kind: "resolve", requestId: table.call.id })}
                >
                  {t("panel.going")}
                </button>
              </div>
            )}
            {table.bill && (
              <div
                data-testid="bill-alert"
                className={clsx(
                  BLEED,
                  "bg-pom-tint text-pomegranate flex min-h-14 items-center gap-2.5 py-2 text-[1.0625rem] font-semibold",
                )}
              >
                <StateIcon state="bill" payment={table.bill.payment} className="size-5 shrink-0" />
                {table.bill.payment === "card"
                  ? t("panel.billCard")
                  : table.bill.payment === "cash"
                    ? t("panel.billCash")
                    : t("panel.billRequested")}
              </div>
            )}
          </div>
        )}

        {table.waiting && (
          <section
            data-testid="waiting-party"
            aria-labelledby="waiting-title"
            className={clsx(BLEED, "bg-amber-tint grid gap-3 py-4")}
          >
            <h3
              id="waiting-title"
              className="m-0 flex items-center gap-2 text-[1.25rem] leading-tight font-bold"
            >
              <Users aria-hidden="true" className="text-amber-text size-5 shrink-0" />
              {t("waiting.title", { label: table.label })}
            </h3>
            <p className="m-0 text-[0.9375rem]">{t("waiting.body")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={button("primary")}
                disabled={blocker !== null}
                onClick={() => table.sessionId && p.onSettle(table.sessionId)}
              >
                {t("waiting.closeOld")}
              </button>
              <button
                type="button"
                className={button("secondary")}
                onClick={() => table.waiting && p.onSeatWaiting(table.waiting.sessionId)}
              >
                {t("waiting.sameParty")}
              </button>
            </div>
            <h4 className="text-staff-label2 m-0 text-[0.9375rem] font-semibold">{t("waiting.orders")}</h4>
            {table.waiting.orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                tableLabel={p.table.label}
                locale={locale}
                held
                onAction={p.onAction}
                onReject={setRejecting}
                onCancel={setCancelling}
              />
            ))}
          </section>
        )}

        {table.orders.length === 0 && !table.waiting && (
          <p className="text-staff-label2 m-0">{t("panel.noOrders")}</p>
        )}
        {table.orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            tableLabel={p.table.label}
            locale={locale}
            answeredBelow={o.id === pendingOrder?.id}
            onAction={p.onAction}
            onReject={setRejecting}
            onCancel={setCancelling}
            pos={p.posSends?.[o.id]}
            onPosRetry={p.onPosRetry}
          />
        ))}
        {/* Another round: a quiet outline at the end of the list, the close stays below. */}
        <button type="button" className={button("outline", "min-h-14")} onClick={p.onOpenPad}>
          <Plus aria-hidden="true" />
          {t("panel.addOrder")}
        </button>
        <TableTimeline table={table} timeZone={p.timeZone} />
      </div>

      {/* One bar: the total on the left, the one thing to do on the right. */}
      <div className="border-staff-sep grid gap-2 border-t bg-white px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] lg:px-6">
        <div className="flex min-h-14 items-center gap-3">
          {onlyPending ? (
            // The chip on the order already says «Սպասում է հաստատման»: the
            // bar keeps its usual «Ընդամենը» and marks the figure as not yet
            // accepted.
            <div data-testid="table-pending" className="grid min-w-0 flex-1 leading-tight">
              <span className="text-staff-label2 text-[0.9375rem] font-semibold">{t("panel.total")}</span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <b className="num text-amber-text text-[1.5rem] font-bold">{formatAmd(pendingAmount, locale)}</b>
                <span className="text-amber-text text-[0.9375rem] font-semibold">{t("panel.pendingSuffix")}</span>
              </span>
            </div>
          ) : (
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="text-staff-label2 text-[0.9375rem] font-semibold">{t("panel.total")}</span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <b data-testid="table-total" className="num text-[1.5rem] font-bold">
                  {formatAmd(table.total, locale)}
                </b>
                {pendingAmount > 0 && (
                  <span className="num text-amber-text text-[0.9375rem] font-semibold">
                    {t("panel.pendingTotal", { amount: formatAmd(pendingAmount, locale) })}
                  </span>
                )}
              </span>
            </div>
          )}
          {blocker !== "pending" && (
            <button
              type="button"
              className={button(toServe ? "outline" : "primary", "min-h-14 shrink-0")}
              disabled={blocker !== null}
              onClick={() => table.sessionId && p.onSettle(table.sessionId)}
            >
              <Receipt aria-hidden="true" />
              {t("panel.close")}
            </button>
          )}
        </div>
        {blocker === "pending" && pendingOrder && (
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button
              type="button"
              className={button("outline", "min-h-14 px-4!")}
              disabled={pendingOrder.pending}
              onClick={() => setRejecting(pendingOrder)}
            >
              {t("order.reject")}
            </button>
            <button
              type="button"
              className={button("primary", "min-h-14 px-4! whitespace-nowrap")}
              disabled={pendingOrder.pending}
              onClick={() => p.onAction({ kind: "accept", orderId: pendingOrder.id })}
            >
              {pendingOrder.number === null
                ? t("order.accept")
                : t("panel.acceptOrder", { number: pendingOrder.number })}
            </button>
          </div>
        )}
      </div>

      {rejecting && (
        <RejectSheet
          onClose={() => setRejecting(null)}
          onConfirm={(reason) => {
            p.onAction({ kind: "reject", orderId: rejecting.id, reason });
            setRejecting(null);
          }}
        />
      )}
      {cancelling && (
        <CancelSheet
          line={cancelling}
          managerOnly={cancelling.served && p.role !== "owner" && p.role !== "manager"}
          onClose={() => setCancelling(null)}
          onConfirm={(quantity, reason) => p.onCancelLine(cancelling.id, quantity, reason)}
        />
      )}
    </>
  );
}

function statusWord(
  t: ReturnType<typeof useTranslations<"waiter">>,
  s: "new" | "cooking" | "ready" | "served",
) {
  return t(`order.${s}`);
}

function OrderCard({
  order,
  tableLabel,
  locale,
  held,
  answeredBelow,
  onAction,
  onReject,
  onCancel,
  pos,
  onPosRetry,
}: {
  order: WaiterOrder;
  tableLabel: string;
  locale: Locale;
  held?: boolean;
  /** Accept and Reject for this order sit in the panel's bottom bar. */
  answeredBelow?: boolean;
  onAction: (action: WaiterAction) => void;
  onReject: (order: WaiterOrder) => void;
  onCancel: (line: WaiterLine) => void;
  pos?: WaiterPosSend;
  onPosRetry?: (id: number) => Promise<{ ok: boolean }>;
}) {
  const t = useTranslations("waiter");
  const tPrint = useTranslations("print");
  const placed = order.status === "placed";
  const live = order.status === "accepted" && order.number !== null;
  const ready = live ? order.tickets.filter((k) => k.status === "ready") : [];
  const several = order.tickets.length > 1;
  const stationLabel = (name: string | null) => name ?? t("order.kitchen");

  return (
    // A section of the panel, not a card: the heading row (number, where it came
    // from, print), the state, then the dishes as 56 px rows split by hairlines.
    <article data-testid="order" data-order-id={order.id} data-status={order.status} className="grid gap-2">
      <div className="flex min-h-11 items-center gap-2">
        <h3 className="m-0 text-[1.375rem] leading-tight font-bold">
          {order.number === null ? t("order.unsent") : t("order.title", { number: order.number })}
        </h3>
        <span className={clsx(chip.base, chip.plain)}>{t(`order.source.${order.source}`)}</span>
        {order.number !== null && order.lines.length > 0 && (
          <PrintTicketButton
            label={tPrint("button")}
            iconOnly
            className="text-ink hover:bg-staff-fill -mr-2 ml-auto grid size-11 shrink-0 place-items-center rounded-full"
          >
            <TicketSheet
              table={tableLabel}
              orderNumber={order.number}
              time={new Date(order.placedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
              lines={order.lines
                .filter((l) => l.quantity > 0)
                .map((l) => ({ quantity: l.quantity, name: l.name.text, modifiers: l.modifiers.map((m) => m.text), substitute: l.substitute?.text ?? null, note: l.note }))}
              note={order.note}
            />
          </PrintTicketButton>
        )}
      </div>

      <div className="flex flex-wrap gap-2 empty:hidden">
        {placed && (
          <span className={clsx(chip.base, chip.wait)}>
            <Clock aria-hidden="true" />
            {t("order.placed")}
          </span>
        )}
        {order.status === "rejected" && (
          <span className={clsx(chip.base, chip.plain)}>{t("order.rejected")}</span>
        )}
        {order.status === "cancelled" && (
          <span className={clsx(chip.base, chip.plain)}>{t("order.cancelled")}</span>
        )}
        {order.status === "accepted" &&
          order.tickets.map((k) => {
            if (k.status === "cancelled") return null;
            const word = statusWord(t, k.status);
            return (
              <span
                key={k.id}
                data-testid="station-chip"
                className={clsx(
                  chip.base,
                  k.status === "ready" ? chip.ready : k.status === "served" ? chip.done : chip.plain,
                )}
              >
                {k.status === "ready" && <HandPlatter aria-hidden="true" />}
                {k.status === "served" && <Check aria-hidden="true" />}
                {several ? t("order.station", { station: stationLabel(k.stationName), status: word }) : word}
              </span>
            );
          })}
        {order.duplicate && placed && (
          <span className={clsx(chip.base, chip.alert)}>
            <Copy aria-hidden="true" />
            {t("order.duplicate")}
          </span>
        )}
        {order.pending && (
          <span data-testid="unsent" className={clsx(chip.base, chip.wait)}>
            {t("order.unsentMark")}
          </span>
        )}
      </div>

      <ul className="border-staff-sep m-0 grid list-none border-t p-0">
        {order.lines.map((l) => (
          <li
            key={l.id}
            data-testid="line"
            className="border-staff-sep flex min-h-14 items-center justify-between gap-3 border-b py-2"
          >
            <span
              className={clsx(
                "min-w-0 text-[1.0625rem] break-words",
                l.quantity === 0 && "text-staff-label2 line-through",
              )}
            >
              <span className="num">{l.quantity === 0 ? l.cancelled : l.quantity}</span>
              {" × "}
              <span lang={l.name.locale !== locale ? l.name.locale : undefined}>{l.name.text}</span>
              {l.modifiers.length > 0 && (
                <span className="text-staff-label2 block text-[0.9375rem]">
                  {l.modifiers.map((m, i) => (
                    <span key={i} lang={m.locale !== locale ? m.locale : undefined}>
                      {i > 0 && ", "}
                      {m.text}
                    </span>
                  ))}
                </span>
              )}
              {l.substitute && (
                <span
                  data-testid="line-substitute"
                  lang={l.substitute.locale !== locale ? l.substitute.locale : undefined}
                  className="block text-[0.9375rem] font-bold"
                >
                  {t("order.useInstead", { name: l.substitute.text })}
                </span>
              )}
              {l.note && <em className="text-amber-text block text-[0.9375rem] not-italic">{l.note}</em>}
              {l.cancelled > 0 && l.quantity > 0 && (
                <span className="text-staff-label2 block text-[0.9375rem]">
                  {t("order.cancelledCount", { count: l.cancelled })}
                </span>
              )}
            </span>
            {/* Cancelling is a quiet «…» 12 px past the price: it opens the
                sheet that asks how many and why, never a one-tap removal. */}
            <span className="flex flex-none items-center gap-3">
              <span className="num text-[1.0625rem] font-semibold">{formatAmd(l.lineTotal, locale)}</span>
              {live && l.quantity > 0 && !order.pending && (
                <button
                  type="button"
                  aria-label={t("order.cancelLine", { name: l.name.text })}
                  aria-haspopup="dialog"
                  onClick={() => onCancel(l)}
                  className="text-staff-label2 hover:bg-staff-fill -mr-2 grid size-11 place-items-center rounded-full"
                >
                  <Ellipsis aria-hidden="true" className="size-5" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {order.note && (
        <p className="text-amber-text m-0 text-[0.9375rem]">{t("order.note", { note: order.note })}</p>
      )}
      {pos && onPosRetry && order.status !== "placed" && (
        <PosOrderStatus
          send={pos}
          changed={order.status === "cancelled" || order.lines.some((l) => l.cancelled > 0 || l.cantMakePending)}
          onRetry={onPosRetry}
        />
      )}
      {order.status === "rejected" && order.rejectReason && (
        <p className="text-staff-label2 m-0 text-[0.9375rem]">
          {t("order.reason", { reason: order.rejectReason })}
        </p>
      )}

      {placed && !answeredBelow && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={button("primary")}
            disabled={held || order.pending}
            onClick={() => onAction({ kind: "accept", orderId: order.id })}
          >
            <Check aria-hidden="true" />
            {t("order.accept")}
          </button>
          <button
            type="button"
            className={button("danger")}
            disabled={order.pending}
            onClick={() => onReject(order)}
          >
            <X aria-hidden="true" />
            {t("order.reject")}
          </button>
        </div>
      )}
      {placed && held && <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("waiting.acceptAfter")}</p>}
      {ready.map((k) => (
        <button
          key={k.id}
          type="button"
          className={button("primary")}
          onClick={() => onAction({ kind: "serve", ticketId: k.id })}
        >
          <HandPlatter aria-hidden="true" />
          {several ? t("order.serveAt", { station: stationLabel(k.stationName) }) : t("order.serve")}
        </button>
      ))}
    </article>
  );
}

const REJECT_REASONS = ["notHere", "duplicate", "soldOut", "other"] as const;

function RejectSheet({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const t = useTranslations("waiter.reject");
  const id = useId();
  const [reason, setReason] = useState<(typeof REJECT_REASONS)[number] | null>(null);
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <div className="grid gap-4 p-5 sm:p-6">
        <h2 id={id} className="m-0 text-[1.375rem] leading-tight font-bold">
          {t("title")}
        </h2>
        <div role="group" aria-labelledby={id} className="grid gap-2">
          {REJECT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={choice}
            >
              {t(`reasons.${r}`)}
              {reason === r && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={button("secondary")} onClick={onClose}>
            {t("back")}
          </button>
          <button
            type="button"
            className={button("destructive")}
            disabled={!reason}
            onClick={() => reason && onConfirm(t(`reasons.${reason}`))}
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

const CANCEL_REASONS = ["changedMind", "mistake", "soldOut", "quality"] as const;

// Quantity plus reason (screens.md §6). After the food is served only a
// manager can cancel it; the database checks the same (api.cancel_order_item).
function CancelSheet({
  line,
  managerOnly,
  onClose,
  onConfirm,
}: {
  line: WaiterLine;
  managerOnly: boolean;
  onClose: () => void;
  onConfirm: (quantity: number, reason: string) => Promise<DirectResult>;
}) {
  const t = useTranslations("waiter.cancel");
  const locale = useLocale() as Locale;
  const id = useId();
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<"manager" | "offline" | null>(managerOnly ? "manager" : null);

  const confirm = async () => {
    if (!reason) return;
    setBusy(true);
    const res = await onConfirm(quantity, t(`reasons.${reason}`));
    setBusy(false);
    if (res.ok) onClose();
    else if (res.reason === "forbidden") setRefused("manager");
    else if (res.reason === "network") setRefused("offline");
    else onClose();
  };

  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <div className="grid gap-4 p-5 sm:p-6">
        <h2 id={id} className="m-0 text-[1.375rem] leading-tight font-bold">
          {t("title")}
        </h2>
        <p
          className="m-0 text-[1.0625rem] font-semibold"
          lang={line.name.locale !== locale ? line.name.locale : undefined}
        >
          {line.name.text}
        </p>
        {refused === "manager" ? (
          <p
            role="alert"
            className="bg-pom-tint text-pomegranate m-0 flex gap-2 rounded-2xl px-4 py-3 font-semibold"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t("managerOnly")}
          </p>
        ) : (
          <>
            {refused === "offline" && (
              <p role="alert" className="text-pomegranate m-0 flex items-center gap-2 font-semibold">
                <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
                {t("offline")}
              </p>
            )}
            <div className="flex items-center gap-4">
              <span className="font-semibold">{t("quantity")}</span>
              <button
                type="button"
                aria-label={t("less")}
                className={button("secondary", "w-12 px-0")}
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => q - 1)}
              >
                <Minus aria-hidden="true" />
              </button>
              <span data-testid="cancel-quantity" className="num w-8 text-center text-2xl font-bold">
                {quantity}
              </span>
              <button
                type="button"
                aria-label={t("more")}
                className={button("secondary", "w-12 px-0")}
                disabled={quantity >= line.quantity}
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus aria-hidden="true" />
              </button>
            </div>
            <div role="group" aria-label={t("reason")} className="grid grid-cols-2 gap-2">
              {CANCEL_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                  className={clsx(choice, "py-2")}
                >
                  {t(`reasons.${r}`)}
                  {reason === r && <Check aria-hidden="true" />}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={button("secondary", refused === "manager" ? "col-span-2" : undefined)}
            onClick={onClose}
          >
            {t("back")}
          </button>
          {refused !== "manager" && (
            <button
              type="button"
              className={button("destructive")}
              disabled={!reason || busy}
              onClick={() => void confirm()}
            >
              {t("confirm")}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
