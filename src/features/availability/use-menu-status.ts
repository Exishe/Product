"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { MenuStatus } from "./status";

// Keeps the open guest menu up to date (ADR-068): the page reloads its server
// data when the status of the café changes. Only this stub is in the first
// load; the poll (menu-status-poll.ts) is fetched LOAD_AFTER_MS later, and its
// first answer is still due 10 s after the page opened, as before.
const LOAD_AFTER_MS = 3_000;
const FIRST_POLL_MS = 10_000;

export function useMenuStatus(
  locationId: string,
  shown: MenuStatus,
  /**
   * Reloads the menu data in place. Without it the page's server data is
   * refreshed; the guest menu passes its own, so a refresh after an in-place
   * language switch (ADR-092) never rebuilds the page and closes what is open.
   */
  reload?: () => void,
) {
  const router = useRouter();
  const last = useRef(shown);
  const reloadRef = useRef(reload);
  useEffect(() => {
    last.current = shown;
    reloadRef.current = reload;
  }, [shown, reload]);

  useEffect(() => {
    let stop = () => {};
    let gone = false;
    const timer = setTimeout(() => {
      void import("./menu-status-poll")
        .then((m) => {
          if (gone) return;
          stop = m.startMenuStatusPoll({
            locationId,
            shown: () => last.current,
            onChange: () => (reloadRef.current ? reloadRef.current() : router.refresh()),
            firstDelayMs: FIRST_POLL_MS - LOAD_AFTER_MS,
          });
        })
        .catch(() => {});
    }, LOAD_AFTER_MS);
    return () => {
      gone = true;
      clearTimeout(timer);
      stop();
    };
  }, [locationId, router]);
}
