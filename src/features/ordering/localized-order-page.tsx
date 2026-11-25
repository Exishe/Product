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
        // Top right: order something new.
        tools={
          <a
            href={menuHref}
            aria-label={t("order.orderMore")}
            className="bg-add text-on-add rounded-pill inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-3 font-semibold whitespace-nowrap transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 md:px-5"
          >
            <Plus size={20} aria-hidden />
            <span className="hidden md:inline">{t("order.orderMore")}</span>
          </a>
        }
      />
      <OrderStatusView
        tableId={tableId}
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
