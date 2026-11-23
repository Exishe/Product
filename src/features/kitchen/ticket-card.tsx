"use client";

import { clsx } from "clsx";
import {
  Ban,
  Check,
  CircleAlert,
  Clock,
  Flame,
  Hourglass,
  MessageSquareText,
  ShieldAlert,
  Undo2,
  WifiOff,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PrintTicketButton, TicketSheet } from "../print-ticket/print-ticket";
import { lineKey, type BoardLine, type KitchenAction, type ShownTicket } from "./board-model";
import { ageLabel, classifyLateness, type Lateness } from "./lateness";

// A ticket on the light kitchen board (ADR-056), readable at 1.5 m: table
// number 64 px, quantity boxes and dish names 26 px, one big 72 px action.
// The head band is the timer: grey while on time, amber with an hourglass and
// «Շտապ» from 8 minutes, red with an alert sign and «Ուշանում է» from 12
// (lateness.ts), and the ticket's border takes the same colour. Every state
// has a word and an icon as well as a colour. In the narrow Ready column
// everything is a size smaller. The quantity has its own column, so a long
// name wraps beside it and never pushes it out of sight.

export type Column = "new" | "cooking" | "ready";

const BAND: Record<Lateness | "void", string> = {
  normal: "bg-basalt-4 text-slip",
  hurry: "bg-apricot text-ink",
  late: "bg-late-on-dark text-white",
  void: "bg-pom-tint text-pomegranate",
};
const BORDER: Record<Lateness | "void", string> = {
  normal: "border-(--kds-frame)",
  hurry: "border-apricot-deep",
  late: "border-late-on-dark",
  void: "border-late-on-dark",
};

function Root({
  id,
  number,
  label,
  kind,
  lateness,
  pending,
  allergy,
  highlighted,
  children,
}: {
  id: string;
  number: number;
  label: string;
  kind: "order" | "void";
  lateness: Lateness;
  pending: boolean;
  allergy: boolean;
  highlighted: boolean;
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
      data-allergy={allergy || undefined}
      data-highlighted={highlighted || undefined}
      className={clsx(
        "bg-basalt-3 text-slip relative grid shrink-0 overflow-hidden rounded-2xl border-4 transition-colors duration-200",
        BORDER[kind === "void" ? "void" : lateness],
        pending && "border-dashed",
        // A dish picked in «Ընդհանուր» outlines every ticket that has it.
        highlighted && "outline-slip outline-4 outline-offset-2",
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

// A guest's note. One that names an allergy is red-edged with a shield, the
// rest are the amber note chip with a speech icon (colour is never alone).
function Note({
  text,
  allergy,
  compact,
  testId,
  className,
}: {
  text: string;
  allergy: boolean;
  compact: boolean;
  testId: string;
  className?: string;
}) {
  const Icon = allergy ? ShieldAlert : MessageSquareText;
  return (
    <span
      data-testid={testId}
      data-allergy={allergy || undefined}
      className={clsx(
        "text-ink inline-flex items-start gap-2 justify-self-start rounded-lg border-2 px-2 py-0.5 font-semibold [overflow-wrap:anywhere]",
        allergy ? "bg-pom-tint border-late-on-dark" : "border-(--kds-note-edge) bg-(--kds-note)",
        compact ? "text-base" : "text-xl",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={clsx(
          "shrink-0",
          compact ? "mt-0.5 size-4" : "mt-1 size-5",
          allergy ? "text-pomegranate" : "text-amber-text",
        )}
      />
      <span className="min-w-0">{text}</span>
    </span>
  );
}

function Lines({
  ticketId,
  lines,
  compact,
  struck,
  done,
  onToggle,
}: {
  ticketId: string;
  lines: readonly BoardLine[];
  compact: boolean;
  struck: boolean; // a cancellation slip: every line is crossed out
  done?: ReadonlySet<string>; // lines a cook has bumped (Cooking only)
  onToggle?: (lineId: string) => void;
}) {
  const t = useTranslations("kitchen.ticket");
  const boardLocale = useLocale();
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {lines.map((l) => {
        const gone = struck || l.quantity === 0;
        const bumped = !gone && !!done?.has(lineKey(ticketId, l.id));
        const reduced = !gone && l.quantity < l.orderedQuantity;
        const tappable = !gone && onToggle !== undefined;
        const body = (
          <>
            <span className="grid justify-items-stretch gap-0.5 text-center">
              <span
                data-testid="line-qty"
                className={clsx(
                  "num rounded-lg border-2 font-bold",
                  compact ? "text-xl leading-[30px]" : "text-[1.875rem] leading-10",
                  gone && "line-through decoration-[3px]",
                  bumped ? "bg-tarragon-on-dark border-tarragon-on-dark text-white" : "border-slip",
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
                (gone || bumped) && "text-slip-dim line-through decoration-[3px]",
              )}
            >
              {l.name}
            </span>
            {l.detail && (l.detail.section || l.detail.portion) && (
              <span
                data-testid="line-detail"
                className={clsx("text-slip-dim col-start-2 font-semibold", compact ? "text-base" : "text-xl")}
              >
                {[
                  l.detail.section,
                  l.detail.portion && t(`units.${l.detail.portion.unit}`, { amount: l.detail.portion.amount }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
            {gone && !struck && (
              <span
                data-testid="line-cancelled"
                className="text-pom-on-dark col-start-2 text-base font-bold"
              >
                {t("lineCancelled")}
              </span>
            )}
            {l.modifiers.length > 0 && (
              <span
                data-testid="line-modifiers"
                className={clsx("text-slip-dim col-start-2 font-semibold", compact ? "text-base" : "text-xl")}
              >
                {l.modifiers.map((m) => m.text).join(", ")}
              </span>
            )}
            {l.note && (
              <Note
                text={l.note}
                allergy={l.allergy}
                compact={compact}
                testId="line-note"
                className="col-start-2"
              />
            )}
          </>
        );
        const grid = clsx(
          "grid items-baseline gap-x-3 gap-y-1",
          compact ? "grid-cols-[40px_minmax(0,1fr)]" : "grid-cols-[52px_minmax(0,1fr)]",
        );
        return (
          <li key={l.id} data-testid="ticket-line" data-done={bumped || undefined}>
            {tappable ? (
              // Item-level bump: tap a dish when it's plated (56 px row).
              <button
                type="button"
                aria-pressed={bumped}
                onClick={() => onToggle(l.id)}
                className={clsx(grid, "-mx-2 min-h-14 w-[calc(100%+1rem)] rounded-xl px-2 py-1 text-left")}
              >
                {body}
              </button>
            ) : (
              <div className={grid}>{body}</div>
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

export const TicketCard = { Root, Head, Body, Lines, Actions, Note };

const BIG_BUTTON =
  "inline-flex min-h-[72px] w-full items-center justify-center gap-3 rounded-xl px-3 text-2xl font-bold [&_svg]:size-7 [&_svg]:shrink-0";

export function OrderTicketCard({
  ticket,
  column,
  now,
  highlighted = false,
  done,
  onToggleLine,
  onAction,
}: {
  ticket: ShownTicket;
  column: Column;
  now: number;
  fresh: boolean;
  highlighted?: boolean;
  done?: ReadonlySet<string>;
  onToggleLine?: (ticket: ShownTicket, lineId: string) => void;
  onAction: (action: KitchenAction) => void;
}) {
  const t = useTranslations("kitchen.ticket");
  const age = now - ticket.createdAt;
  const lateness = classifyLateness(
    age,
    column === "ready" ? "ready" : ticket.status === "cooking" ? "cooking" : "new",
  );
  const label = ageLabel(age);
  const compact = column === "ready";
  const move = (next: "cooking" | "ready") =>
    onAction({ kind: "set_ticket_status", ticketId: ticket.id, expected: ticket.status, next });
  const locale = useLocale();
  const tPrint = useTranslations("print");
  const TimerIcon = lateness === "late" ? CircleAlert : lateness === "hurry" ? Hourglass : Clock;

  return (
    <TicketCard.Root
      id={ticket.id}
      number={ticket.number}
      label={t("tableLabel", { table: ticket.table ?? ticket.number })}
      kind="order"
      lateness={lateness}
      pending={ticket.pending}
      allergy={ticket.allergy}
      highlighted={highlighted}
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
              <span data-testid="ticket-timer" className="num whitespace-nowrap">
                {label.unit === "now"
                  ? t("justNow")
                  : label.unit === "minutes"
                    ? t("minutes", { minutes: label.value })
                    : t("hours", { hours: label.value })}
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
      {ticket.allergy && (
        <p
          data-testid="ticket-allergy"
          className={clsx(
            "bg-late-on-dark m-0 flex items-center gap-2 px-4 py-2 font-bold text-white",
            compact ? "text-lg" : "text-2xl",
          )}
        >
          <ShieldAlert aria-hidden="true" className={clsx("shrink-0", compact ? "size-5" : "size-7")} />
          {t("allergy")}
        </p>
      )}
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
        <TicketCard.Lines
          ticketId={ticket.id}
          lines={ticket.lines}
          compact={compact}
          struck={false}
          done={column === "cooking" ? done : undefined}
          onToggle={
            column === "cooking" && onToggleLine && !ticket.pending
              ? (lineId) => onToggleLine(ticket, lineId)
              : undefined
          }
        />
        {ticket.orderNote && (
          <TicketCard.Note
            text={ticket.orderNote}
            allergy={ticket.orderAllergy}
            compact={compact}
            testId="ticket-note"
          />
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
                className="border-slip-dim text-slip inline-flex min-h-14 items-center gap-2 rounded-xl border-2 px-4 text-left text-lg leading-tight font-bold"
                onClick={() => move("cooking")}
              >
                <Undo2 aria-hidden="true" className="size-5 shrink-0" />
                {t("undo")}
              </button>
            </div>
          )}
          <PrintTicketButton
            label={tPrint("button")}
            className="border-(--kds-frame) text-slip inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 px-3 text-lg font-bold"
          >
            <TicketSheet
              table={ticket.table}
              orderNumber={ticket.number}
              time={new Date(ticket.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
              lines={ticket.lines
                .filter((l) => l.quantity > 0)
                .map((l) => ({ quantity: l.quantity, name: l.name, modifiers: l.modifiers.map((m) => m.text), note: l.note }))}
              note={ticket.orderNote}
            />
          </PrintTicketButton>
        </TicketCard.Actions>
      </TicketCard.Body>
    </TicketCard.Root>
  );
}

// A cancellation stays on top of New, red, with struck-through lines, until a
// cook taps «Հասկացա» (R7).
export function VoidTicketCard({
  ticket,
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
      pending={ticket.pending}
      allergy={false}
      highlighted={false}
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
        <TicketCard.Lines ticketId={ticket.id} lines={ticket.lines} compact={false} struck />
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
