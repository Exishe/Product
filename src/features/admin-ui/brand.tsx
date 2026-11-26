import { clsx } from "clsx";

// Pativ's one lockup for the front door (landing header and footer, sign-in,
// sign-up, pairing, 404): an ink disc with a white ring and a white centre,
// then the name in the display face. Ink only: amber, red and green carry
// state on Pativ screens, never the brand. The mark is decorative; the name
// is the text a link around the lockup is called by.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className={clsx("shrink-0", className ?? "size-7")}>
      <circle cx="32" cy="32" r="32" fill="#1B1D21" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#FFFFFF" strokeWidth="5" />
      <circle cx="32" cy="32" r="7" fill="#FFFFFF" />
    </svg>
  );
}

// The lockup as a link home: 44 px tall, no underline.
export function BrandLink({ href, name, className }: { href: string; name: string; className?: string }) {
  return (
    <a
      href={href}
      className={clsx("text-ink inline-flex min-h-11 items-center gap-2.5 no-underline", className)}
    >
      <BrandMark />
      <span className="display-face text-[1.25rem] leading-none font-medium!">{name}</span>
    </a>
  );
}

// One language option (Հայ / Рус / Eng) wherever the front door offers the
// choice: 44x44, 15 px, slate; the current one ink, semibold and underlined.
export const localeOption =
  "text-slate hover:text-ink aria-[current=page]:text-ink aria-pressed:text-ink grid min-h-11 min-w-11 place-items-center text-label no-underline decoration-2 underline-offset-4 aria-[current=page]:font-semibold aria-[current=page]:underline aria-pressed:font-semibold aria-pressed:underline";
