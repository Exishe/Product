// The connection label in the board's top bar (realtime.md, reliability.md R1):
// green while live updates flow, amber while (re)connecting, and red
// «Կապ չկա» only after 15 seconds without the network, so a short Wi-Fi hiccup
// doesn't send anyone running to the hotspot.

export const OFFLINE_LABEL_AFTER_MS = 15_000;

export type ChannelState = "subscribed" | "connecting" | "down";
export type Connection = "online" | "connecting" | "offline";

export type ConnectionInput = {
  browserOnline: boolean;
  lastFetchFailed: boolean;
  channel: ChannelState;
  troubleSince: number | null;
  now: number;
};

export function connectionState(i: ConnectionInput): Connection {
  const networkDown = !i.browserOnline || i.lastFetchFailed;
  if (networkDown) {
    return i.troubleSince !== null && i.now - i.troubleSince >= OFFLINE_LABEL_AFTER_MS ? "offline" : "connecting";
  }
  // Without the live channel the board still refreshes every 10 seconds.
  return i.channel === "subscribed" ? "online" : "connecting";
}

export function troubleSince(previous: number | null, networkDown: boolean, now: number): number | null {
  if (!networkDown) return null;
  return previous ?? now;
}
