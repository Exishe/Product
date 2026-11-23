// The one thing the guest menu imports for analytics: a few bytes that load
// the real tracker (tracker.ts) after the page is up. Events carry no personal
// data (ADR-072). Failures are swallowed: analytics must never break ordering.
import type { EventKind, EventMeta } from "./tracker-core";

export type Track = (kind: EventKind, itemId: string, meta?: EventMeta) => void;

export const makeTrack =
  (location: string, table: string | null): Track =>
  (kind, itemId, meta) => {
    try {
      void import("./tracker")
        .then((m) =>
          m.track(location, table, meta ? { kind, item_id: itemId, meta } : { kind, item_id: itemId }),
        )
        .catch(() => {});
    } catch {}
  };
