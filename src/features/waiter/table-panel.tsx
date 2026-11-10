"use client";

import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/routing";
import type { MemberRole } from "@/lib/auth/membership";
import { formatAmd } from "@/lib/format/money";
import type { DirectResult } from "./actions";
import { closeBlocker, type FloorTable, type WaiterAction, type WaiterLine, type WaiterOrder } from "./floor-model";
import { button, chip, Sheet } from "./ui";

export type PanelProps = {
  table: FloorTable;
  role: MemberRole;
  onAction: (action: WaiterAction) => void;
  onOpenPad: () => void;
  onSettle: (sessionId: string) => void;
  onSeatWaiting: (waitingSessionId: string) => void;
  onCancelLine: (lineId: string, quantity: number, reason: string) => Promise<DirectResult>;
};

// The right-hand panel (screens.md §6, design/waiter.html): alerts, the
// table's rounds newest first, and the actions that apply.
export function TablePanel(p: PanelProps) {
  const t = useTranslations("waiter");
  const locale = useLocale() as Locale;
  const [rejecting, setRejecting] = useState<WaiterOrder | null>(null);
  const [cancelling, setCancelling] = useState<WaiterLine | null>(null);
  const { table } = p;
  const blocker = closeBlocker(table);
  const title = t("panel.table", { label: table.label });

  if (table.state === "free" && table.orders.length === 0) {
    return (
      <>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-6">
          <h2 className="display-face m-0 text-[2.375rem] leading-none">{title}</h2>
          <p className="m-0 text-muted">{t("panel.free")}</p>
          <p className="m-0 text-muted">{t("panel.freeHint")}</p>
        </div>
        <div className="grid gap-3 border-t border-line px-6 py-4">
          <button type="button" className={button("primary")} onClick={p.onOpenPad}>
            {t("panel.takeOrder")}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid flex-1 content-start gap-4 overflow-y-auto p-6 *:min-w-0">
        <h2 className="display-face m-0 text-[2.375rem] leading-none">{title}</h2>
        {table.openMinutes !== null && <p className="m-0 text-muted">{t("panel.openFor", { minutes: table.openMinutes })}</p>}

        {table.call && (
          <div data-testid="call-alert" className="flex items-center justify-between gap-3 rounded-sheet bg-pom-tint px-4 py-3 font-semibold text-pomegranate">
            <span>{table.call.minutes > 0 ? t("panel.callAgo", { minutes: table.call.minutes }) : t("panel.callNow")}</span>
            <button
              type="button"
              className={button("danger", "flex-none")}
              onClick={() => table.call && p.onAction({ kind: "resolve", requestId: table.call.id })}
            >
              {t("panel.going")}
            </button>
          </div>
        )}
        {table.bill && <div className="rounded-sheet bg-mist px-4 py-3 font-semibold">{t("panel.billRequested")}</div>}

        {table.waiting && (
          <section data-testid="waiting-party" aria-labelledby="waiting-title" className="grid gap-3 rounded-sheet border-2 border-apricot-deep p-4">
            <h3 id="waiting-title" className="m-0 text-xl">
              {t("waiting.title", { label: table.label })}
            </h3>
            <p className="m-0">{t("waiting.body")}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={button("ink", "flex-1")}
                disabled={blocker !== null}
                onClick={() => table.sessionId && p.onSettle(table.sessionId)}
              >
                {t("waiting.closeOld")}
              </button>
              <button
                type="button"
                className={button("quiet", "flex-1")}
                onClick={() => table.waiting && p.onSeatWaiting(table.waiting.sessionId)}
              >
                {t("waiting.sameParty")}
              </button>
            </div>
            <h4 className="m-0 text-base text-muted">{t("waiting.orders")}</h4>
            {table.waiting.orders.map((o) => (
              <OrderCard key={o.id} order={o} locale={locale} held onAction={p.onAction} onReject={setRejecting} onCancel={setCancelling} />
            ))}
          </section>
        )}

        {table.orders.length === 0 && !table.waiting && <p className="m-0 text-muted">{t("panel.noOrders")}</p>}
        {table.orders.map((o) => (
          <OrderCard key={o.id} order={o} locale={locale} onAction={p.onAction} onReject={setRejecting} onCancel={setCancelling} />
        ))}
      </div>

      <div className="grid gap-3 border-t border-line px-6 py-4">
        <div className="flex justify-between text-2xl font-bold">
          <span>{t("panel.total")}</span>
          <span data-testid="table-total" className="num">
            {formatAmd(table.total, locale)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={button("quiet")} onClick={p.onOpenPad}>
            {t("panel.addOrder")}
          </button>
          <button
            type="button"
            className={button("ink")}
            disabled={blocker !== null}
            onClick={() => table.sessionId && p.onSettle(table.sessionId)}
          >
            {t("panel.close")}
          </button>
        </div>
        {blocker === "pending" && <p className="m-0 text-muted">{t("panel.closeBlocked")}</p>}
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

function statusWord(t: ReturnType<typeof useTranslations<"waiter">>, s: "new" | "cooking" | "ready" | "served") {
  return t(`order.${s}`);
}

function OrderCard({
  order,
  locale,
  held,
  onAction,
  onReject,
  onCancel,
}: {
  order: WaiterOrder;
  locale: Locale;
  held?: boolean;
  onAction: (action: WaiterAction) => void;
  onReject: (order: WaiterOrder) => void;
  onCancel: (line: WaiterLine) => void;
}) {
  const t = useTranslations("waiter");
  const placed = order.status === "placed";
  const live = order.status === "accepted" && order.number !== null;
  const ready = live ? order.tickets.filter((k) => k.status === "ready") : [];
  const several = order.tickets.length > 1;
  const stationLabel = (name: string | null) => name ?? t("order.kitchen");

  return (
    <article
      data-testid="order"
      data-order-id={order.id}
      data-status={order.status}
      className={clsx("grid gap-3 rounded-sheet border p-4", placed ? "border-2 border-apricot-deep" : "border-line")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-xl">{order.number === null ? t("order.unsent") : t("order.title", { number: order.number })}</strong>
        <span className={clsx(chip.base, chip.plain)}>{t(`order.source.${order.source}`)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {placed && <span className={clsx(chip.base, chip.wait)}>{t("order.placed")}</span>}
        {order.status === "rejected" && <span className={clsx(chip.base, chip.plain)}>{t("order.rejected")}</span>}
        {order.status === "cancelled" && <span className={clsx(chip.base, chip.plain)}>{t("order.cancelled")}</span>}
        {order.status === "accepted" &&
          order.tickets.map((k) => {
            if (k.status === "cancelled") return null;
            const word = statusWord(t, k.status);
            return (
              <span
                key={k.id}
                data-testid="station-chip"
                className={clsx(chip.base, k.status === "ready" ? chip.ready : k.status === "served" ? chip.done : chip.plain)}
              >
                {several ? t("order.station", { station: stationLabel(k.stationName), status: word }) : word}
              </span>
            );
          })}
        {order.duplicate && placed && <span className={clsx(chip.base, chip.alert)}>{t("order.duplicate")}</span>}
        {order.pending && (
          <span data-testid="unsent" className={clsx(chip.base, chip.wait)}>
            {t("order.unsentMark")}
          </span>
        )}
      </div>

      <ul className="m-0 grid list-none gap-1 p-0">
        {order.lines.map((l) => (
          <li key={l.id} data-testid="line" className="flex items-start justify-between gap-3">
            <span className={clsx("min-w-0 break-words", l.quantity === 0 && "text-muted line-through")}>
              <span className="num">{l.quantity === 0 ? l.cancelled : l.quantity}</span>
              {" × "}
              <span lang={l.name.locale !== locale ? l.name.locale : undefined}>{l.name.text}</span>
              {l.modifiers.length > 0 && (
                <span className="block text-sm text-muted">
                  {l.modifiers.map((m, i) => (
                    <span key={i} lang={m.locale !== locale ? m.locale : undefined}>
                      {i > 0 && ", "}
                      {m.text}
                    </span>
                  ))}
                </span>
              )}
              {l.note && <em className="block text-sm text-muted not-italic">{l.note}</em>}
              {l.cancelled > 0 && l.quantity > 0 && (
                <span className="block text-sm text-muted">{t("order.cancelledCount", { count: l.cancelled })}</span>
              )}
            </span>
            <span className="flex flex-none items-start gap-1">
              <span className="num pt-0.5">{formatAmd(l.lineTotal, locale)}</span>
              {live && l.quantity > 0 && !order.pending && (
                <button
                  type="button"
                  aria-label={t("order.cancelLine", { name: l.name.text })}
                  onClick={() => onCancel(l)}
                  className="-my-3 grid size-14 place-items-center rounded-sheet text-xl text-muted hover:bg-mist"
                >
                  ×
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {order.note && <p className="m-0 text-sm text-muted">{t("order.note", { note: order.note })}</p>}
      {order.status === "rejected" && order.rejectReason && (
        <p className="m-0 text-sm text-muted">{t("order.reason", { reason: order.rejectReason })}</p>
      )}

      {placed && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className={button("primary")}
            disabled={held || order.pending}
            onClick={() => onAction({ kind: "accept", orderId: order.id })}
          >
            {t("order.accept")}
          </button>
          <button type="button" className={button("danger")} disabled={order.pending} onClick={() => onReject(order)}>
            {t("order.reject")}
          </button>
        </div>
      )}
      {placed && held && <p className="m-0 text-sm text-muted">{t("waiting.acceptAfter")}</p>}
      {ready.map((k) => (
        <button key={k.id} type="button" className={button("go")} onClick={() => onAction({ kind: "serve", ticketId: k.id })}>
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
      <div className="grid gap-4 p-6">
        <h2 id={id} className="m-0 text-2xl">
          {t("title")}
        </h2>
        <div role="group" aria-labelledby={id} className="grid gap-2">
          {REJECT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={clsx(button("quiet"), "justify-start aria-pressed:border-tarragon aria-pressed:bg-tarragon aria-pressed:text-white")}
            >
              {t(`reasons.${r}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={button("quiet")} onClick={onClose}>
            {t("back")}
          </button>
          <button type="button" className={button("danger")} disabled={!reason} onClick={() => reason && onConfirm(t(`reasons.${reason}`))}>
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
      <div className="grid gap-4 p-6">
        <h2 id={id} className="m-0 text-2xl">
          {t("title")}
        </h2>
        <p className="m-0 text-lg font-semibold" lang={line.name.locale !== locale ? line.name.locale : undefined}>
          {line.name.text}
        </p>
        {refused === "manager" ? (
          <p role="alert" className="m-0 rounded-sheet bg-pom-tint px-4 py-3 font-semibold text-pomegranate">
            {t("managerOnly")}
          </p>
        ) : (
          <>
            {refused === "offline" && (
              <p role="alert" className="m-0 font-semibold text-pomegranate">
                {t("offline")}
              </p>
            )}
            <div className="flex items-center gap-4">
              <span className="font-semibold">{t("quantity")}</span>
              <button
                type="button"
                aria-label={t("less")}
                className={button("quiet", "w-14")}
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => q - 1)}
              >
                −
              </button>
              <span data-testid="cancel-quantity" className="num w-8 text-center text-2xl font-bold">
                {quantity}
              </span>
              <button
                type="button"
                aria-label={t("more")}
                className={button("quiet", "w-14")}
                disabled={quantity >= line.quantity}
                onClick={() => setQuantity((q) => q + 1)}
              >
                +
              </button>
            </div>
            <div role="group" aria-label={t("reason")} className="grid grid-cols-2 gap-2">
              {CANCEL_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                  className={clsx(button("quiet"), "aria-pressed:border-tarragon aria-pressed:bg-tarragon aria-pressed:text-white")}
                >
                  {t(`reasons.${r}`)}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={button("quiet", refused === "manager" ? "col-span-2" : undefined)} onClick={onClose}>
            {t("back")}
          </button>
          {refused !== "manager" && (
            <button type="button" className={button("danger")} disabled={!reason || busy} onClick={() => void confirm()}>
              {t("confirm")}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
