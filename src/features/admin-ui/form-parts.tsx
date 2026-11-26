"use client";

import { clsx } from "clsx";
import { CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { alert, button, field, fieldLabel, iconButton, input } from "./styles";

// Sign-in, sign-up and pairing fields (ADR-094, benchmark rule 13): 52 px
// tall, 17 px text, white on the white page with the 3.4:1 edge.
export const authInput = clsx(field, "h-13");

// A labelled text field with one line under it: the hint, or the error that
// replaces it. The line sits outside the <label>, so it is the field's
// description (aria-describedby), not part of its name. A password field
// given `reveal` (the button's name) gets a 44 px eye button inside its right
// edge that shows what was typed; aria-pressed says whether it is shown.
export function TextField({
  label,
  hint,
  error,
  inputClassName,
  reveal,
  type,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string | null;
  inputClassName?: string;
  reveal?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const message = error || hint;
  const canReveal = Boolean(reveal) && type === "password";
  const control = (
    <input
      id={id}
      type={canReveal && shown ? "text" : type}
      aria-invalid={error ? true : undefined}
      aria-describedby={message ? `${id}-note` : undefined}
      className={clsx(inputClassName ?? input, canReveal && "pr-13")}
      {...props}
    />
  );
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      {canReveal ? (
        <div className="relative">
          {control}
          <button
            type="button"
            aria-label={reveal}
            aria-pressed={shown}
            aria-controls={id}
            onClick={() => setShown((v) => !v)}
            className={iconButton("text-staff-label2 hover:text-ink absolute inset-y-0 right-1 my-auto")}
          >
            {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
      ) : (
        control
      )}
      {message && (
        <p
          id={`${id}-note`}
          className={clsx(
            "text-label m-0 flex items-start gap-1.5",
            error ? "text-pomegranate font-semibold" : "text-staff-label2",
          )}
        >
          {error && <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
          {message}
        </p>
      )}
    </div>
  );
}

// An error from the server, under the fields.
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className={clsx(alert.base, alert.error)}>
      <CircleAlert aria-hidden="true" />
      {children}
    </p>
  );
}

// The form's one black button. While the request runs it stays black, shows a
// spinner and ignores taps (the form's onSubmit also ignores Enter while
// pending). It is not `disabled`: the grey disabled fill reads as "dead".
export function SubmitButton({
  pending,
  label,
  pendingLabel,
  className,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      className={button("primary", clsx("mt-1 w-full", pending && "pointer-events-none", className))}
    >
      {pending && <LoaderCircle aria-hidden="true" className="size-4! motion-safe:animate-spin" />}
      {pending ? pendingLabel : label}
    </button>
  );
}

// The value of a named field in a submitted form.
export const formValue = (form: HTMLFormElement, name: string) => {
  const el = form.elements.namedItem(name);
  return el instanceof HTMLInputElement ? el.value : "";
};

// Focus the first field the form marked aria-invalid, after React renders it.
export const focusFirstInvalid = (form: HTMLFormElement) =>
  requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
