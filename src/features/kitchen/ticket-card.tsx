"use client";

import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import type { BoardLine, KitchenAction, ShownTicket } from "./board-model";
import { classifyLateness, elapsedMinutes, type Lateness } from "./lateness";

// A paper slip on the kitchen board (design/kitchen.html): table number 64 px,
// quantity boxes and dish names 26 px, one big 72 px action. In the narrow
// Ready column everything is a size smaller. The quantity has its own column,
// so a long name wraps beside it and never pushes it out of sight.

export type Column = "new" | "cooking" | "ready";

const PERFORATION: CSSProperties = {
  background: "radial-gradient(circle at 6px 5px, var(--color-basalt-2) 3px, transparent 3.5px) 0 0 / 12px 10px repeat-x",
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
        "relative grid shrink-0 gap-2 rounded-slip border-l-8 bg-slip px-4 pb-3 pt-4 text-ink",
        kind === "void"
          ? "border-l-pomegranate outline-[3px] outline-offset-0 outline-pom-on-dark outline-solid"
          : lateness === "late"
            ? "border-l-pomegranate"
            : lateness === "hurry"
              ? "border-l-apricot"
              : "border-l-transparent",
        fresh && "animate-in fade-in slide-in-from-left-10 duration-[420ms] ease-[cubic-bezier(.2,.8,.2,1)]",
      )}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-[5px] h-[10px]" style={PERFORATION} />
      {children}
    </article>
  );
}

function Head({ table, number, compact, meta }: { table: string | null; number: number; compact: boolean; meta: ReactNode }) {
  const t = useTranslations("kitchen.ticket");
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="grid min-w-0 leading-none">
        <small className="text-sm font-semibold text-muted">{table ? t("table") : t("noTable")}</small>
        <b
          data-testid="ticket-table"
          className={clsx(
            "num font-bold tracking-[-0.01em] [overflow-wrap:anywhere]",
            compact || (table !== null && table.length > 4) ? "text-5xl leading-[1.05]" : "text-kds-number",
          )}
        >
          {table ?? number}
        </b>
      </span>
      <span className="grid justify-items-end gap-1 text-right">{meta}</span>
    </div>
  );
}

function Lines({ lines, compact, struck }: { lines: readonly BoardLine[]; compact: boolean; struck: boolean }) {
  const t = useTranslations("kitchen.ticket");
  const boardLocale = useLocale();
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {lines.map((l) => {
        const gone = struck || l.quantity === 0;
        const reduced = !gone && l.quantity < l.orderedQuantity;
        return (
          <li
            key={l.id}
            data-testid="ticket-line"
            className={clsx("grid items-baseline gap-x-3 gap-y-1", compact ? "grid-cols-[36px_minmax(0,1fr)]" : "grid-cols-[48px_minmax(0,1fr)]")}
          >
            <span className="grid justify-items-stretch gap-0.5 text-center">
              <span
                data-testid="line-qty"
                className={clsx(
                  "num rounded-chip border-2 border-ink font-bold",
                  compact ? "text-xl leading-[30px]" : "text-[1.875rem] leading-10",
                  gone && "line-through decoration-[3px]",
                )}
              >
                {gone && !struck ? l.orderedQuantity : l.quantity}
              </span>
              {reduced && (
                <s aria-label={t("was", { quantity: l.orderedQuantity })} className="num text-base font-bold text-pomegranate">
                  {l.orderedQuantity}
                </s>
              )}
            </span>
            <span
              data-testid="line-name"
              lang={l.nameLocale === boardLocale ? undefined : l.nameLocale}
              className={clsx(
                "min-w-0 font-semibold leading-[1.15] hyphens-auto [overflow-wrap:anywhere]",
                compact ? "text-xl" : "text-kds-item",
                gone && "line-through decoration-[3px]",
              )}
            >
              {l.name}
            </span>
            {l.modifiers.length > 0 && (
              <span data-testid="line-modifiers" className={clsx("col-start-2 font-semibold text-muted", compact ? "text-base" : "text-xl")}>
                {l.modifiers.map((m) => m.text).join(", ")}
              </span>
            )}
            {l.note && (
              <span
                data-testid="line-note"
                className={clsx(
                  "col-start-2 justify-self-start rounded-chip bg-[#FCE8C8] px-2 py-0.5 font-semibold [overflow-wrap:anywhere]",
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

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-2 grid">{children}</div>;
}

export const TicketCard = { Root, Head, Lines, Actions };

const BIG_BUTTON = "min-h-[72px] w-full rounded-chip px-3 text-2xl font-bold active:translate-y-px";

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
  const lateness = classifyLateness(age, column === "ready" ? "ready" : ticket.status === "cooking" ? "cooking" : "new");
  const minutes = elapsedMinutes(age);
  const compact = column === "ready";
  const move = (next: "cooking" | "ready") =>
    onAction({ kind: "set_ticket_status", ticketId: ticket.id, expected: ticket.status, next });

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
        meta={
          <>
            <span data-testid="ticket-timer" className={clsx("num font-bold", compact ? "text-xl" : "text-[1.875rem] leading-tight")}>
              {minutes === 0 ? t("justNow") : t("minutes", { minutes })}
            </span>
            {lateness === "hurry" && (
              <span data-testid="ticket-age" className="rounded-chip bg-apricot px-2 py-0.5 text-base font-bold text-ink">
                {t("hurry")}
              </span>
            )}
            {lateness === "late" && (
              <span data-testid="ticket-age" className="rounded-chip bg-pomegranate px-2 py-0.5 text-base font-bold text-white">
                {t("late")}
              </span>
            )}
            <span className="text-sm text-muted">{t("order", { number: ticket.number, source: t(`source.${ticket.source}`) })}</span>
            {ticket.pending && (
              <span data-testid="ticket-pending" className="rounded-chip border border-dashed border-ink px-2 py-0.5 text-sm font-bold">
                {t("pending")}
              </span>
            )}
          </>
        }
      />
      <TicketCard.Lines lines={ticket.lines} compact={compact} struck={false} />
      {ticket.orderNote && (
        <p
          data-testid="ticket-note"
          className={clsx(
            "m-0 justify-self-start rounded-chip bg-[#FCE8C8] px-2 py-0.5 font-semibold [overflow-wrap:anywhere]",
            compact ? "text-base" : "text-xl",
          )}
        >
          {ticket.orderNote}
        </p>
      )}
      <TicketCard.Actions>
        {column === "new" && (
          <button type="button" className={clsx(BIG_BUTTON, "bg-apricot text-ink")} onClick={() => move("cooking")}>
            {t("start")}
          </button>
        )}
        {column === "cooking" && (
          <button type="button" className={clsx(BIG_BUTTON, "bg-tarragon text-white")} onClick={() => move("ready")}>
            {t("ready")}
          </button>
        )}
        {column === "ready" && (
          <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-muted">
            <span>{t("waiting")}</span>
            <button
              type="button"
              className="min-h-14 rounded-chip border-2 border-ink bg-transparent px-4 text-base font-bold text-ink active:translate-y-px"
              onClick={() => move("cooking")}
            >
              {t("undo")}
            </button>
          </div>
        )}
      </TicketCard.Actions>
    </TicketCard.Root>
  );
}

// A cancellation stays on top of New, red, with struck-through lines, until a
// cook taps «Հասկացա» (R7).
export function VoidTicketCard({ ticket, fresh, onAction }: { ticket: ShownTicket; fresh: boolean; onAction: (action: KitchenAction) => void }) {
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
      <p className="m-0 text-2xl font-bold text-pomegranate">{t("void")}</p>
      <TicketCard.Head
        table={ticket.table}
        number={ticket.number}
        compact={false}
        meta={<span className="text-sm text-muted">{t("voidOrder", { number: ticket.number })}</span>}
      />
      <TicketCard.Lines lines={ticket.lines} compact={false} struck />
      <TicketCard.Actions>
        <button
          type="button"
          className={clsx(BIG_BUTTON, "bg-pomegranate text-white")}
          onClick={() => onAction({ kind: "acknowledge_void", ticketId: ticket.id })}
        >
          {t("acknowledge")}
        </button>
      </TicketCard.Actions>
    </TicketCard.Root>
  );
}
