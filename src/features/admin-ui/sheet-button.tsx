"use client";

import { useState, type ReactNode } from "react";
import { Sheet } from "./sheet";
import { button, textAction, type ButtonKind } from "./styles";

// A button that opens a form in the shared Sheet (ADR-093): create forms stay
// out of the page until the owner asks for one. The sheet keeps what the form
// showed (a new password, a code) until it is closed.
export function SheetButton({
  label,
  shortLabel,
  title,
  closeLabel,
  icon,
  kind = "secondary",
  className,
  testId,
  children,
}: {
  label: string;
  // Shown instead of the label below 640 px, so a header action stays on its
  // heading's line on a phone; the full label remains the accessible name.
  shortLabel?: string;
  title: string;
  closeLabel: string;
  icon?: ReactNode;
  // "text": a quiet text action, for a group header next to its heading.
  kind?: ButtonKind | "text";
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
        className={kind === "text" ? textAction("ink", className) : button(kind, className)}
        data-testid={testId}
        aria-label={shortLabel ? label : undefined}
      >
        {icon}
        {shortLabel ? (
          <>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="max-sm:hidden">{label}</span>
          </>
        ) : (
          label
        )}
      </button>
      {open && (
        <Sheet title={title} closeLabel={closeLabel} onClose={() => setOpen(false)}>
          {children}
        </Sheet>
      )}
    </>
  );
}
