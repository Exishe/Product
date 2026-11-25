"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { AlertList } from "./alert-list";
import type { TableAlert } from "./model";
import { useTableAlerts } from "./use-table-alerts";

// "Attention needed" on the admin home: the problem tables right now.
export function AttentionPanel({ locationId, initial }: { locationId: string; initial: TableAlert[] }) {
  const t = useTranslations("alerts");
  const alerts = useTableAlerts(locationId, initial);
  return (
    <div data-testid="attention-panel" aria-live="polite">
      {alerts.length === 0 ? (
        <p
          className="text-staff-label2 m-0 flex items-center gap-2 text-[1.0625rem]"
          data-testid="attention-empty"
        >
          <CircleCheck aria-hidden="true" className="text-tarragon size-5 shrink-0" />
          {t("none")}
        </p>
      ) : (
        <AlertList alerts={alerts} />
      )}
    </div>
  );
}
