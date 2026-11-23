"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
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
        // A plain fetch of the one RPC: the guest menu ships no Supabase client.
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/public_menu_status`, {
          method: "POST",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
            "Content-Type": "application/json",
            "Content-Profile": "api",
          },
          body: JSON.stringify({ p_location_id: locationId }),
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        const next = res.ok ? parseStatus(await res.json()) : null;
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
