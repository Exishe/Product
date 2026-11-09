"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-12 items-center rounded-input bg-apricot px-5 font-semibold text-ink"
    >
      {label}
    </button>
  );
}
