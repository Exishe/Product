"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { backoffMs, parseStatus, sameStatus, type MenuStatus } from "./status";

// Keeps the open guest menu up to date (ADR-068). One tiny RPC every 10 s
// (api.public_menu_status: stop list, pause, closed, hidden sections, version);
// the page reloads its server data only when the answer differs from what it
// shows. Nothing runs while the tab is hidden; coming back polls at once.
// An error (offline, function not deployed yet) backs off up to a minute and
// never shows anything to the guest.
export function useMenuStatus(locationId: string, shown: MenuStatus) {
  const router = useRouter();
  const last = useRef(shown);
  useEffect(() => {
    last.current = shown;
  }, [shown]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let stopped = false;
    let inFlight = false;

    const schedule = () => {
      if (stopped || document.hidden) return;
      timer = setTimeout(() => void poll(), backoffMs(failures));
    };
    const poll = async () => {
      if (stopped || document.hidden || inFlight) return;
      inFlight = true;
      try {
        const { data, error } = await getBrowserClient()
          .schema("api")
          .rpc("public_menu_status", { p_location_id: locationId })
          .abortSignal(AbortSignal.timeout(8_000));
        const next = error ? null : parseStatus(data);
        if (!next) {
          failures += 1;
        } else {
          failures = 0;
          if (!sameStatus(next, last.current)) router.refresh();
        }
      } catch {
        failures += 1;
      } finally {
        inFlight = false;
        schedule();
      }
    };
    const onVisible = () => {
      clearTimeout(timer);
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [locationId, router]);
}
