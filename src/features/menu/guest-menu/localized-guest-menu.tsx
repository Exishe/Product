"use client";

import { useCallback, useMemo, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { fetchPublicMenu } from "./fetch-menu";
import type { LanguageLink } from "./guest-header";
import { GuestMenu, type TableState } from "./guest-menu";
import type { MenuHints } from "./hints";
import { PromoBanners } from "./promo-banner";
import { buildGuestMenu, type PublicMenu, type WordmarkTones } from "./view-model";

// The guest menu in the language on screen. The published snapshot carries
// every language, so switching (ADR-092) only rebuilds the view here: the
// cart, an open dish sheet with its choices and note, the order view and the
// scroll position stay as they were. When the café's status changes (sold
// out, pause, section hours) the snapshot is read again here, in place,
// instead of refreshing the page from the server, which after a switch would
// rebuild it in the new language and close what the guest has open.
export function LocalizedGuestMenu({
  published,
  tones,
  table,
  languages,
  hints,
  restaurant,
  location,
}: {
  published: PublicMenu;
  tones: WordmarkTones;
  table: TableState;
  languages: LanguageLink[];
  hints: MenuHints;
  restaurant: string;
  location: string;
}) {
  const { t, locale } = useGuestI18n();
  const [data, setData] = useState(published);
  // A new snapshot from the server (a later page render) replaces ours.
  const [served, setServed] = useState(published);
  if (published !== served) {
    setServed(published);
    setData(published);
  }
  const reloadMenu = useCallback(() => {
    void fetchPublicMenu(restaurant, location).then((fresh) => {
      if (fresh) setData(fresh);
    });
  }, [restaurant, location]);
  const menu = useMemo(() => buildGuestMenu(data, locale, tones), [data, locale, tones]);
  return (
    <GuestMenu
      menu={menu}
      table={table}
      languages={languages}
      hints={hints}
      reloadMenu={reloadMenu}
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
      orderHref={
        table.kind === "ok"
          ? `/${locale}/m/${restaurant}/${location}/order?t=${encodeURIComponent(table.token)}`
          : null
      }
    />
  );
}
