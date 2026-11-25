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

export function useMenuStatus(locationId: string, shown: MenuStatus) {
  const router = useRouter();
  const last = useRef(shown);
  useEffect(() => {
    last.current = shown;
  }, [shown]);

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
            onChange: () => router.refresh(),
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
