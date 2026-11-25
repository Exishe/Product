"use client";

import { useMemo } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import type { LanguageLink } from "./guest-header";
import { GuestMenu, type TableState } from "./guest-menu";
import type { MenuHints } from "./hints";
import { PromoBanners } from "./promo-banner";
import { buildGuestMenu, type PublicMenu, type WordmarkTones } from "./view-model";

// The guest menu in the language on screen. The published snapshot carries
// every language, so switching (ADR-092) only rebuilds the view here: the
// cart, an open dish sheet with its choices and note, the order view and the
// scroll position stay as they were.
export function LocalizedGuestMenu({
  published,
  tones,
  table,
  languages,
  hints,
  path,
}: {
  published: PublicMenu;
  tones: WordmarkTones;
  table: TableState;
  languages: LanguageLink[];
  hints: MenuHints;
  /** The menu's address without the language: /m/{café}/{location}. */
  path: string;
}) {
  const { t, locale } = useGuestI18n();
  const menu = useMemo(() => buildGuestMenu(published, locale, tones), [published, locale, tones]);
  return (
    <GuestMenu
      menu={menu}
      table={table}
      languages={languages}
      hints={hints}
      promoBanners={
        menu.promos.length > 0 ? (
          <PromoBanners
            promos={menu.promos}
            locale={locale}
            label={t("menu.promoLabel")}
            closeLabel={t("menu.promoClose")}
          />
        ) : null
      }
      orderHref={table.kind === "ok" ? `/${locale}${path}/order?t=${encodeURIComponent(table.token)}` : null}
    />
  );
}
