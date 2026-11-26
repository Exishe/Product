"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { Plus } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { GuestHeader } from "@/features/menu/guest-menu/guest-header";
import { useGuestI18n } from "./guest-i18n-context";
import { OrderStatusView } from "./order-status-view";

type ViewProps = ComponentProps<typeof OrderStatusView>;

/** What the order page shows that depends on the language: dish names and texts. */
export type OrderTexts = {
  dishes: ViewProps["dishes"];
  details: ViewProps["details"];
  cantMakeDishes: ViewProps["cantMakeDishes"];
};

// The order page in the language on screen (ADR-092): the server prepares the
// dish texts of every offered language, so a switch swaps them here and the
// order, its status and anything the guest has open stay.
export function LocalizedOrderPage({
  header,
  texts,
  path,
  query,
  tableId,
  token = null,
  vapidPublicKey,
  wait,
  pairs,
}: {
  header: Omit<ComponentProps<typeof GuestHeader>, "tools" | "home" | "compact">;
  texts: Partial<Record<Locale, OrderTexts>>;
  /** The menu's address without the language: /m/{café}/{location}. */
  path: string;
  /** "?t=<token>" or "". */
  query: string;
  tableId: string;
  /** The table's QR token (the waiter's choices before any order). */
  token?: string | null;
  vapidPublicKey: string | null;
  wait: ViewProps["wait"];
  pairs: ViewProps["pairs"];
}) {
  const { t, locale } = useGuestI18n();
  const menuHref = `/${locale}${path}${query}`;
  const shown = texts[locale] ?? Object.values(texts)[0];

  // The tab's title follows a switch; the first one comes from the server.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.title = t("cart.title");
  }, [t]);

  return (
    <>
      <GuestHeader
        {...header}
        // A short bar: the order starts near the top of the screen.
        compact
        home={{ href: menuHref }}
        // Order something new: an outline pill with its words, beside the
        // table (not on the empty page, whose own button does it).
        tools={
          <a
            href={menuHref}
            data-order-more=""
            className="border-line-strong text-ink hover:bg-chip rounded-pill inline-flex min-h-11 items-center justify-center gap-1.5 border pr-4 pl-3 text-label font-semibold whitespace-nowrap transition-transform duration-150 active:scale-95"
          >
            <Plus size={18} aria-hidden />
            {t("order.orderMore")}
          </a>
        }
      />
      <OrderStatusView
        tableId={tableId}
        token={token}
        menuHref={menuHref}
        vapidPublicKey={vapidPublicKey}
        wait={wait}
        details={shown?.details}
        cantMakeDishes={shown?.cantMakeDishes}
        dishes={shown?.dishes ?? []}
        pairs={pairs}
      />
    </>
  );
}
