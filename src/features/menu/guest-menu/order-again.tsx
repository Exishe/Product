"use client";

import { useMemo } from "react";
import { cartSummary, type CartMenu } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { loadLastOrder, type SavedLine } from "@/features/ordering/last-order";
import { formatAmd } from "@/lib/format/money";
import { Plate, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

const NAMES = 3;

/** The saved lines that can be ordered today: still on the menu, options still valid, not sold out. */
export function orderableAgain(saved: readonly SavedLine[], menu: CartMenu): SavedLine[] {
  const lines = saved.map((l, i) => ({ ...l, id: String(i), note: "" }));
  return cartSummary(lines, menu)
    .lines.filter((p) => p.status === "ok")
    .map(({ line }) => ({ itemId: line.itemId, modifierIds: line.modifierIds, quantity: line.quantity }));
}

// "Last time here": a regular's last order at this café, offered at the top
// of an empty cart's menu with one button that puts it back in the cart.
// Only dishes that can be had today; nothing shows when none can. Loaded
// only on a phone that has ordered here before.
export function OrderAgain({
  locationId,
  items,
  menu,
  onAdd,
}: {
  locationId: string;
  items: Record<string, GuestItem>;
  menu: CartMenu;
  onAdd: (lines: SavedLine[]) => void;
}) {
  const { t, locale } = useGuestI18n();
  const lines = useMemo(
    () => orderableAgain(loadLastOrder(window.localStorage, locationId), menu),
    [locationId, menu],
  );
  const dishes = lines.map((l) => items[l.itemId]).filter((i): i is GuestItem => Boolean(i));
  if (dishes.length === 0) return null;
  const total = cartSummary(
    lines.map((l, i) => ({ ...l, id: String(i), note: "" })),
    menu,
  ).total;
  const names = dishes
    .slice(0, NAMES)
    .map((d) => d.name.text)
    .join(", ");
  const more = dishes.length - NAMES;
  return (
    <section
      aria-labelledby="again-title"
      data-testid="order-again"
      className="bg-surface shadow-card rounded-card mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border [border-color:var(--guest-card-border)] px-4 py-3"
    >
      <span aria-hidden="true" className="flex flex-none -space-x-3">
        {dishes.slice(0, NAMES).map((d) => (
          <Plate
            key={d.id}
            src={d.image ? dishPhotoUrl(d.image) : null}
            size={40}
            className="size-10 ring-2 ring-[var(--guest-surface)]"
          />
        ))}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <h2 id="again-title" className="text-muted text-body font-semibold">
          {t("again.title")}
        </h2>
        <p className="leading-snug break-words">
          {names}
          {more > 0 ? ` ${t("again.more", { count: more })}` : null}
          <span className="num text-muted"> · {formatAmd(total, locale)}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onAdd(lines)}
        className="rounded-pill text-ink hover:bg-chip min-h-11 flex-none border [border-color:color-mix(in_srgb,var(--guest-line-strong)_60%,transparent)] px-4 text-body font-semibold"
      >
        {t("again.add")}
      </button>
    </section>
  );
}
