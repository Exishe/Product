import { describe, expect, it } from "vitest";
import { connectionState, OFFLINE_LABEL_AFTER_MS, troubleSince } from "./connection";

const base = { browserOnline: true, lastFetchFailed: false, channel: "subscribed" as const, troubleSince: null, now: 100_000 };

describe("connectionState", () => {
  it("is online when data arrives and live updates are on", () => {
    expect(connectionState(base)).toBe("online");
  });

  it("says it is connecting while the live channel is down, even for long, because polling still works", () => {
    expect(connectionState({ ...base, channel: "connecting" })).toBe("connecting");
    expect(connectionState({ ...base, channel: "down" })).toBe("connecting");
  });

  it("turns red only after 15 seconds without the network", () => {
    expect(OFFLINE_LABEL_AFTER_MS).toBe(15_000);
    const down = { ...base, browserOnline: false, troubleSince: 100_000 };
    expect(connectionState({ ...down, now: 100_000 })).toBe("connecting");
    expect(connectionState({ ...down, now: 114_999 })).toBe("connecting");
    expect(connectionState({ ...down, now: 115_000 })).toBe("offline");
  });

  it("counts failed requests as no network, even if the browser thinks it is online", () => {
    expect(connectionState({ ...base, lastFetchFailed: true, troubleSince: 50_000 })).toBe("offline");
  });
});

describe("troubleSince", () => {
  it("remembers when the trouble started and forgets it once the network is back", () => {
    expect(troubleSince(null, true, 10)).toBe(10);
    expect(troubleSince(10, true, 20)).toBe(10);
    expect(troubleSince(10, false, 30)).toBeNull();
  });
});
