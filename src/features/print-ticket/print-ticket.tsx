"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A print button for one kitchen ticket or waiter order. The sheet is only in
// the DOM while the browser prints it; it sits on <body>, so the print rule in
// globals.css (.print-ticket) can show just this sheet and nothing else.
export function PrintTicketButton({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [printing, setPrinting] = useState(false);

  useLayoutEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  return (
    <>
      <button type="button" onClick={() => setPrinting(true)} className={className}>
        <Printer aria-hidden="true" className="size-5 shrink-0" />
        {label}
      </button>
      {printing && createPortal(<div className="print-ticket">{children}</div>, document.body)}
    </>
  );
}

export type SheetLine = { quantity: number; name: string; modifiers: string[]; note: string | null };

// The printed ticket: big table number, time, the items as a plain list, and the notes.
export function TicketSheet({
  table,
  orderNumber,
  time,
  lines,
  note,
}: {
  table: string | null;
  orderNumber: number;
  time: string;
  lines: SheetLine[];
  note: string | null;
}) {
  const t = useTranslations("print");
  return (
    <article className="text-black">
      <header className="flex items-end justify-between gap-4 border-b-4 border-black pb-3">
        <div>
          <p className="m-0 text-xl font-semibold">{table ? t("table") : t("noTable")}</p>
          <p className="num m-0 text-[5rem] leading-none font-bold">{table ?? orderNumber}</p>
        </div>
        <div className="text-right">
          <p className="num m-0 text-3xl font-bold">{time}</p>
          <p className="m-0 text-xl">{t("order", { number: orderNumber })}</p>
        </div>
      </header>
      <ul className="m-0 mt-4 grid list-none gap-4 p-0">
        {lines.map((l, i) => (
          <li key={i} className="text-[1.75rem] leading-tight font-semibold break-words">
            <span className="num">{l.quantity}</span> × {l.name}
            {l.modifiers.length > 0 && (
              <span className="block text-xl font-normal">{l.modifiers.join(", ")}</span>
            )}
            {l.note && <span className="block text-xl font-bold">{t("note", { note: l.note })}</span>}
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-6 border-t-2 border-black pt-3 text-2xl font-bold break-words">
          {t("note", { note })}
        </p>
      )}
    </article>
  );
}
