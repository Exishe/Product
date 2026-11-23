"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { parseAlerts, sameAlerts, type TableAlert } from "./model";

const POLL_MS = 15_000;

// The problem-table list, refreshed every 15 s while the tab is visible and at
// once when it comes back. One small RPC, no realtime channel (free plan). A
// failed read keeps the last list: a flaky connection must not hide a problem.
export function useTableAlerts(locationId: string, initial: TableAlert[]): TableAlert[] {
  const [alerts, setAlerts] = useState(initial);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const client = getBrowserClient() as unknown as SupabaseClient;
    const look = async () => {
      if (stopped || document.hidden || inFlight) return;
      inFlight = true;
      try {
        const { data, error } = await client.schema("api").rpc("table_alerts", { p_location_id: locationId });
        const next = error ? null : parseAlerts(data);
        if (next && !stopped) setAlerts((old) => (sameAlerts(old, next) ? old : next));
      } catch {
        // keep the last list
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void look(), POLL_MS);
    document.addEventListener("visibilitychange", look);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
  }, [locationId]);

  return alerts;
}
