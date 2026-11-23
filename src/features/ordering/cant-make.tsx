"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { formatAmd } from "@/lib/format/money";
import type { Database } from "@/lib/supabase/database";
import { useGuestI18n } from "./guest-i18n-context";

export type Dishes = Record<string, { name: string; price: number }>;

// "Sorry, this dish isn't available right now. Our chef suggests: …" (ADR-080).
// The kitchen could not make one dish of this order. The database picks up to 3
// similar dishes by rules (api.cant_make_alternatives); each has a button that
// puts it in the cart and opens the menu. Nothing is ordered by itself. Loaded
// only when such a line exists, so it costs the other pages nothing.
export function CantMakeNote({
  db,
  lineId,
  dishes,
  onAdd,
}: {
  db: SupabaseClient<Database>;
  lineId: string;
  dishes: Dishes | undefined;
  /** Missing when the table is closed: the dishes are only named. */
  onAdd?: (itemId: string) => void;
}) {
  const { t, locale } = useGuestI18n();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    let gone = false;
    void db
      .schema("api")
      .rpc("cant_make_alternatives", { p_order_item_id: lineId })
      .then(({ data, error }) => {
        if (!gone && !error && Array.isArray(data)) setIds(data);
      });
    return () => {
      gone = true;
    };
  }, [db, lineId]);

  const shown = ids.filter((id) => dishes?.[id]).slice(0, 3);
  return (
    <div
      data-testid="cant-make"
      className="bg-chip rounded-card col-span-2 mt-2 grid gap-2 px-4 py-3"
    >
      <p role="status" className="m-0 font-semibold">
        {t("order.cantMake")}
        {shown.length > 0 ? ` ${t("order.cantMakeSuggest")}` : null}
      </p>
      {shown.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {shown.map((id) => {
            const dish = dishes?.[id];
            if (!dish) return null;
            return (
              <li key={id} className="flex items-center justify-between gap-3" data-testid="cant-make-alt">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {dish.name} <span className="num text-muted">{formatAmd(dish.price, locale as Locale)}</span>
                </span>
                {onAdd && (
                  <button
                    type="button"
                    onClick={() => onAdd(id)}
                    aria-label={t("order.cantMakeAddOne", { name: dish.name })}
                    className="rounded-pill text-ink hover:bg-surface inline-flex min-h-11 flex-none items-center gap-1 border [border-color:color-mix(in_srgb,var(--guest-line-strong)_60%,transparent)] px-4 text-sm font-semibold"
                  >
                    <Plus size={16} aria-hidden />
                    {t("order.cantMakeAdd")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
