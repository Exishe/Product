// The browser side of guest event tracking (ADR-072). Loaded lazily by
// track.ts on the first event, so it is not in the menu's first-load bundle.
// A plain fetch of one RPC: the guest menu ships no Supabase client. fetch with
// keepalive (not sendBeacon) because the api schema is chosen with the
// Content-Profile header and apikey is a header; a beacon can set neither.
import { createTracker, type GuestEvent } from "./tracker-core";

const VISIT_KEY = "pativ:ev:v1";

const randomKey = (): string => {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
};

/** The anonymous key: the table's guest session id once there is one, else a random id for this visit. */
export function sessionKey(tableId: string | null): string {
  try {
    if (tableId) {
      const saved = JSON.parse(window.localStorage.getItem(`pativ:guest:v1:${tableId}`) ?? "null") as {
        id?: unknown;
      } | null;
      if (saved && typeof saved.id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(saved.id)) return saved.id;
    }
  } catch {}
  try {
    const known = window.sessionStorage.getItem(VISIT_KEY);
    if (known) return known;
    const fresh = randomKey();
    window.sessionStorage.setItem(VISIT_KEY, fresh);
    return fresh;
  } catch {
    return memoryKey;
  }
}
const memoryKey = randomKey();

const send = (location: string, table: string | null, events: GuestEvent[]) =>
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/record_guest_events`, {
    method: "POST",
    keepalive: true,
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      "Content-Type": "application/json",
      "Content-Profile": "api",
    },
    body: JSON.stringify({ p_location_id: location, p_session: sessionKey(table), p_events: events }),
  });

const doNotTrack = () => {
  try {
    return (
      navigator.doNotTrack === "1" ||
      (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true
    );
  } catch {
    return false;
  }
};

const tracker = createTracker({ send });
let hooked = false;

export function track(location: string, table: string | null, event: GuestEvent): void {
  if (doNotTrack()) return;
  if (!hooked && typeof document !== "undefined") {
    hooked = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") tracker.flush();
    });
    window.addEventListener("pagehide", () => tracker.flush());
  }
  tracker.track(location, table, event);
}
