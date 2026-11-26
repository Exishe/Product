"use client";

import { useState, type ReactNode } from "react";
import { Sheet } from "./sheet";
import { button, type ButtonKind } from "./styles";

// A button that opens a form in the shared Sheet (ADR-093): create forms stay
// out of the page until the owner asks for one. The sheet keeps what the form
// showed (a new password, a code) until it is closed.
export function SheetButton({
  label,
  title,
  closeLabel,
  icon,
  kind = "secondary",
  className,
  testId,
  children,
}: {
  label: string;
  title: string;
  closeLabel: string;
  icon?: ReactNode;
  kind?: ButtonKind;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={button(kind, className)}
        data-testid={testId}
      >
        {icon}
        {label}
      </button>
      {open && (
        <Sheet title={title} closeLabel={closeLabel} onClose={() => setOpen(false)}>
          {children}
        </Sheet>
      )}
    </>
  );
}
