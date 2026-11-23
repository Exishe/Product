"use client";

import { useTranslations } from "next-intl";
import { AlertList } from "./alert-list";
import type { TableAlert } from "./model";
import { useTableAlerts } from "./use-table-alerts";

// A short list above the floor: the waiters are the ones who act. Nothing at
// all while there is no problem (or while the database has no such function).
export function WaiterAlerts({ locationId }: { locationId: string }) {
  const t = useTranslations("alerts");
  const alerts = useTableAlerts(locationId, EMPTY);
  if (alerts.length === 0) return null;
  return (
    <section aria-label={t("waiterTitle")} data-testid="waiter-alerts" className="grid gap-2">
      <AlertList alerts={alerts} dark />
    </section>
  );
}

const EMPTY: TableAlert[] = [];
