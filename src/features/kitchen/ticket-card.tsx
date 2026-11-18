"use client";

import { clsx } from "clsx";
import { Ban, Check, CircleAlert, Clock, Flame, Hourglass, Undo2, WifiOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { BoardLine, KitchenAction, ShownTicket } from "./board-model";
import { classifyLateness, elapsedMinutes, type Lateness } from "./lateness";

// A ticket on the dark kitchen board (ADR-054), readable at 1.5 m: table
// number 64 px, quantity boxes and dish names 26 px, one big 72 px action.
// The head band is the timer: grey while on time, amber with an hourglass and
// «Շտապել» from 8 minutes, red with an alert sign and «Ուշանում է» from 12
// (lateness.ts), and the ticket's border takes the same colour. In the narrow
// Ready column everything is a size smaller. The quantity has its own column,
// so a long name wraps beside it and never pushes it out of sight.

export type Column = "new" | "cooking" | "ready";

const BAND: Record<Lateness | "void", string> = {
  normal: "bg-basalt-4 text-slip",
  hurry: "bg-apricot text-ink",
  late: "bg-late-on-dark text-white",
  void: "bg-pom-tint text-pomegranate",
};
const BORDER: Record<Lateness | "void", string> = {
  normal: "border-basalt-4",
  hurry: "border-apricot",
  late: "border-late-on-dark",
  void: "border-late-on-dark",
};

function Root({
  id,
  number,
  label,
  kind,
  lateness,
  fresh,
  pending,
  children,
}: {
  id: string;
  number: number;
  label: string;
  kind: "order" | "void";
  lateness: Lateness;
  fresh: boolean;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <article
      aria-label={label}
      data-testid="ticket"
      data-ticket-id={id}
      data-order-number={number}
      data-kind={kind}
      data-lateness={lateness}
      data-pending={pending || undefined}
      className={clsx(
        "bg-basalt-3 text-slip relative grid shrink-0 overflow-hidden rounded-2xl border-4 transition-colors duration-200",
        BORDER[kind === "void" ? "void" : lateness],
        pending && "border-dashed",
        // A new ticket fades in (≤ 200 ms) so the cook sees what changed.
        fresh && "animate-in fade-in duration-200",
      )}
    >
      {children}
    </article>
  );
}

function Head({
  table,
  number,
  compact,
  tone,
  meta,
}: {
  table: string | null;
  number: number;
  compact: boolean;
  tone: Lateness | "void";
  meta: ReactNode;
}) {
  const t = useTranslations("kitchen.ticket");
  return (
    <div
      className={clsx(
        "flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 pt-3 pb-3 transition-colors duration-200",
        BAND[tone],
      )}
    >
      <span className="grid min-w-0 leading-none">
        <small className="text-base font-semibold">{table ? t("table") : t("noTable")}</small>
        <b
          data-testid="ticket-table"
          className={clsx(
            "num font-bold tracking-[-0.01em] [overflow-wrap:anywhere]",
            table !== null && table.length > 4
              ? "text-4xl leading-[1.05]"
              : compact
                ? "text-5xl"
                : "text-kds-number",
          )}
        >
          {table ?? number}
        </b>
      </span>
      <span className="ml-auto grid justify-items-end gap-1 text-right">{meta}</span>
    </div>
  );
}

function Lines({
  lines,
  compact,
  struck,
}: {
  lines: readonly BoardLine[];
  compact: boolean;
  struck: boolean;
}) {
  const t = useTranslations("kitchen.ticket");
  const boardLocale = useLocale();
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {lines.map((l) => {
        const gone = struck || l.quantity === 0;
        const reduced = !gone && l.quantity < l.orderedQuantity;
        return (
          <li
            key={l.id}
            data-testid="ticket-line"
            className={clsx(
              "grid items-baseline gap-x-3 gap-y-1",
              compact ? "grid-cols-[40px_minmax(0,1fr)]" : "grid-cols-[52px_minmax(0,1fr)]",
            )}
          >
            <span className="grid justify-items-stretch gap-0.5 text-center">
              <span
                data-testid="line-qty"
                className={clsx(
                  "num border-slip rounded-lg border-2 font-bold",
                  compact ? "text-xl leading-[30px]" : "text-[1.875rem] leading-10",
                  gone && "line-through decoration-[3px]",
                )}
              >
                {gone && !struck ? l.orderedQuantity : l.quantity}
              </span>
              {reduced && (
                <s
                  aria-label={t("was", { quantity: l.orderedQuantity })}
                  className="num text-pom-on-dark text-base font-bold"
                >
                  {l.orderedQuantity}
                </s>
              )}
            </span>
            <span
              data-testid="line-name"
              lang={l.nameLocale === boardLocale ? undefined : l.nameLocale}
              className={clsx(
                "min-w-0 leading-[1.15] font-semibold [overflow-wrap:anywhere] hyphens-auto",
                compact ? "text-xl" : "text-kds-item",
                gone && "text-slip-dim line-through decoration-[3px]",
              )}
            >
              {l.name}
            </span>
            {l.modifiers.length > 0 && (
              <span
                data-testid="line-modifiers"
                className={clsx("text-slip-dim col-start-2 font-semibold", compact ? "text-base" : "text-xl")}
              >
                {l.modifiers.map((m) => m.text).join(", ")}
              </span>
            )}
            {l.note && (
              <span
                data-testid="line-note"
                className={clsx(
                  "text-ink col-start-2 justify-self-start rounded-lg bg-[#FCE8C8] px-2 py-0.5 font-semibold [overflow-wrap:anywhere]",
                  compact ? "text-base" : "text-xl",
                )}
              >
                {l.note}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 px-4 pt-3 pb-4">{children}</div>;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-1 grid">{children}</div>;
}

export const TicketCard = { Root, Head, Body, Lines, Actions };

const BIG_BUTTON =
  "inline-flex min-h-[72px] w-full items-center justify-center gap-3 rounded-xl px-3 text-2xl font-bold active:translate-y-px [&_svg]:size-7 [&_svg]:shrink-0";

export function OrderTicketCard({
  ticket,
  column,
  now,
  fresh,
  onAction,
}: {
  ticket: ShownTicket;
  column: Column;
  now: number;
  fresh: boolean;
  onAction: (action: KitchenAction) => void;
}) {
  const t = useTranslations("kitchen.ticket");
  const age = now - ticket.createdAt;
  const lateness = classifyLateness(
    age,
    column === "ready" ? "ready" : ticket.status === "cooking" ? "cooking" : "new",
  );
  const minutes = elapsedMinutes(age);
  const compact = column === "ready";
  const move = (next: "cooking" | "ready") =>
    onAction({ kind: "set_ticket_status", ticketId: ticket.id, expected: ticket.status, next });
  const TimerIcon = lateness === "late" ? CircleAlert : lateness === "hurry" ? Hourglass : Clock;

  return (
    <TicketCard.Root
      id={ticket.id}
      number={ticket.number}
      label={t("tableLabel", { table: ticket.table ?? ticket.number })}
      kind="order"
      lateness={lateness}
      fresh={fresh}
      pending={ticket.pending}
    >
      <TicketCard.Head
        table={ticket.table}
        number={ticket.number}
        compact={compact}
        tone={lateness}
        meta={
          <>
            <span
              className={clsx(
                "flex items-center gap-2 font-bold",
                compact ? "text-xl" : "text-[1.875rem] leading-tight",
              )}
            >
              <TimerIcon aria-hidden="true" className={compact ? "size-5" : "size-7"} />
              <span data-testid="ticket-timer" className="num">
                {minutes === 0 ? t("justNow") : t("minutes", { minutes })}
              </span>
            </span>
            {lateness !== "normal" && (
              <span
                data-testid="ticket-age"
                className={clsx(
                  "rounded-md px-2 py-0.5 text-lg leading-tight font-bold",
                  lateness === "late" ? "text-pomegranate bg-white" : "bg-ink text-apricot",
                )}
              >
                {lateness === "late" ? t("late") : t("hurry")}
              </span>
            )}
            <span className="text-base font-semibold">
              {t("order", { number: ticket.number, source: t(`source.${ticket.source}`) })}
            </span>
          </>
        }
      />
      <TicketCard.Body>
        {ticket.pending && (
          <span
            data-testid="ticket-pending"
            className="border-slip-dim inline-flex items-center gap-2 justify-self-start rounded-lg border-2 border-dashed px-2 py-0.5 text-base font-bold"
          >
            <WifiOff aria-hidden="true" className="size-4 shrink-0" />
            {t("pending")}
          </span>
        )}
        <TicketCard.Lines lines={ticket.lines} compact={compact} struck={false} />
        {ticket.orderNote && (
          <p
            data-testid="ticket-note"
            className={clsx(
              "text-ink m-0 justify-self-start rounded-lg bg-[#FCE8C8] px-2 py-0.5 font-semibold [overflow-wrap:anywhere]",
              compact ? "text-base" : "text-xl",
            )}
          >
            {ticket.orderNote}
          </p>
        )}
        <TicketCard.Actions>
          {column === "new" && (
            <button
              type="button"
              className={clsx(BIG_BUTTON, "bg-slip text-white")}
              onClick={() => move("cooking")}
            >
              <Flame aria-hidden="true" />
              {t("start")}
            </button>
          )}
          {column === "cooking" && (
            <button
              type="button"
              className={clsx(BIG_BUTTON, "bg-tarragon-on-dark text-white")}
              onClick={() => move("ready")}
            >
              <Check aria-hidden="true" />
              {t("ready")}
            </button>
          )}
          {column === "ready" && (
            <div className="text-slip-dim flex flex-wrap items-center justify-between gap-2 text-lg font-semibold">
              <span>{t("waiting")}</span>
              <button
                type="button"
                className="border-slip-dim text-slip inline-flex min-h-14 items-center gap-2 rounded-xl border-2 px-4 text-left text-lg leading-tight font-bold active:translate-y-px"
                onClick={() => move("cooking")}
              >
                <Undo2 aria-hidden="true" className="size-5 shrink-0" />
                {t("undo")}
              </button>
            </div>
          )}
        </TicketCard.Actions>
      </TicketCard.Body>
    </TicketCard.Root>
  );
}

// A cancellation stays on top of New, red, with struck-through lines, until a
// cook taps «Հասկացա» (R7).
export function VoidTicketCard({
  ticket,
  fresh,
  onAction,
}: {
  ticket: ShownTicket;
  fresh: boolean;
  onAction: (action: KitchenAction) => void;
}) {
  const t = useTranslations("kitchen.ticket");
  return (
    <TicketCard.Root
      id={ticket.id}
      number={ticket.number}
      label={t("voidLabel", { table: ticket.table ?? ticket.number })}
      kind="void"
      lateness="normal"
      fresh={fresh}
      pending={ticket.pending}
    >
      <TicketCard.Head
        table={ticket.table}
        number={ticket.number}
        compact={false}
        tone="void"
        meta={
          <>
            <span className="flex items-center gap-2 text-2xl font-bold">
              <Ban aria-hidden="true" className="size-7 shrink-0" />
              {t("void")}
            </span>
            <span className="text-base font-semibold">{t("voidOrder", { number: ticket.number })}</span>
          </>
        }
      />
      <TicketCard.Body>
        <TicketCard.Lines lines={ticket.lines} compact={false} struck />
        <TicketCard.Actions>
          <button
            type="button"
            className={clsx(BIG_BUTTON, "bg-late-on-dark text-white")}
            onClick={() => onAction({ kind: "acknowledge_void", ticketId: ticket.id })}
          >
            <Check aria-hidden="true" />
            {t("acknowledge")}
          </button>
        </TicketCard.Actions>
      </TicketCard.Body>
    </TicketCard.Root>
  );
}
