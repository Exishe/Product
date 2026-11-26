import type { ReactNode } from "react";

// The title and helper line at the top of every auth screen (AuthShell). Its
// own module, without server imports, so a client screen whose title depends
// on its state (the password reset's expired link) renders the same heading.
// `wide`: from sm the title may run 96 px past the 400 px column and wraps
// "pretty" (no orphan, no forced balance), so a short sentence stays on one line.
export function AuthHeading({
  title,
  subtitle,
  wide,
}: {
  title: string;
  subtitle?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h1
        className={`font-display text-figure m-0 font-normal ${wide ? "text-pretty sm:-mr-24" : "text-balance"}`}
      >
        {title}
      </h1>
      {subtitle && <div className="text-staff-label2 text-name text-pretty">{subtitle}</div>}
    </div>
  );
}
