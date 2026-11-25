import { describe, expect, it } from "vitest";
import {
  BILL_VOLUME,
  bannerRows,
  closeAlert,
  MAX_REPEATS,
  openRequests,
  REPEAT_MS,
  STALE_MS,
  stepAlerts,
  type AlertRequest,
  type AlertState,
} from "./call-alerts";
import type { FloorTable } from "./floor-model";

const call = (id: string, at = 1000, label = "5"): AlertRequest => ({ id, kind: "call", tableId: `t${id}`, label, at });
const bill = (id: string, at = 1000, label = "6"): AlertRequest => ({ id, kind: "bill", tableId: `t${id}`, label, at });
const EMPTY: AlertState = {};

describe("openRequests", () => {
  it("lists calls and bills, oldest first", () => {
    const tables = [
      { id: "a", label: "1", call: { id: "c1", minutes: 0, at: 5000 }, bill: null },
      { id: "b", label: "2", call: null, bill: { id: "b1", minutes: 0, at: 3000, payment: null } },
      { id: "c", label: "3", call: null, bill: null },
    ] as unknown as FloorTable[];
    expect(openRequests(tables, 6000).map((r) => [r.id, r.kind, r.label])).toEqual([
      ["b1", "bill", "2"],
      ["c1", "call", "1"],
    ]);
  });
  it("leaves out a request older than an hour (it stays on the tile, without sound)", () => {
    const tables = [
      { id: "a", label: "1", call: { id: "old", minutes: 0, at: 0 }, bill: null },
      { id: "b", label: "2", call: { id: "new", minutes: 0, at: STALE_MS }, bill: null },
    ] as unknown as FloorTable[];
    expect(openRequests(tables, STALE_MS + 1).map((r) => r.id)).toEqual(["new"]);
  });
});

describe("stepAlerts: what is new", () => {
  it("alerts for a request already open at the first look, once", () => {
    const first = stepAlerts(EMPTY, [call("a")], 0, true);
    expect(first.fresh.map((r) => r.id)).toEqual(["a"]);
    expect(first.play).toEqual({ volume: 1 });
    const second = stepAlerts(first.state, [call("a")], 1000, true);
    expect(second.fresh).toEqual([]);
    expect(second.play).toBeNull();
  });

  it("alerts again only for a request it has not seen", () => {
    const one = stepAlerts(EMPTY, [call("a")], 0, true);
    const two = stepAlerts(one.state, [call("a"), call("b")], 1000, true);
    expect(two.fresh.map((r) => r.id)).toEqual(["b"]);
    expect(two.play).toEqual({ volume: 1 });
  });

  it("forgets a request that is gone, so a new one for the same table is new", () => {
    const one = stepAlerts(EMPTY, [call("a")], 0, true);
    const gone = stepAlerts(one.state, [], 1000, true);
    expect(Object.keys(gone.state)).toEqual([]);
    const again = stepAlerts(gone.state, [call("c")], 2000, true);
    expect(again.fresh.map((r) => r.id)).toEqual(["c"]);
  });

  it("is quiet when nothing is open", () => {
    const s = stepAlerts(EMPTY, [], 0, true);
    expect(s.fresh).toEqual([]);
    expect(s.play).toBeNull();
  });
});

describe("stepAlerts: sound and repeats", () => {
  it("repeats a call every 20 seconds, 3 times at most", () => {
    let state = stepAlerts(EMPTY, [call("a")], 0, true).state;
    let plays = 1;
    for (let t = 1000; t <= 200_000; t += 1000) {
      const step = stepAlerts(state, [call("a")], t, true);
      state = step.state;
      if (step.play) {
        plays++;
        expect(t % REPEAT_MS).toBe(0);
      }
    }
    expect(plays).toBe(1 + MAX_REPEATS);
  });

  it("does not repeat before 20 seconds have passed", () => {
    const state = stepAlerts(EMPTY, [call("a")], 0, true).state;
    expect(stepAlerts(state, [call("a")], REPEAT_MS - 1, true).play).toBeNull();
    expect(stepAlerts(state, [call("a")], REPEAT_MS, true).play).toEqual({ volume: 1 });
  });

  it("plays a bill once and quieter", () => {
    const first = stepAlerts(EMPTY, [bill("b")], 0, true);
    expect(first.play).toEqual({ volume: BILL_VOLUME });
    expect(stepAlerts(first.state, [bill("b")], REPEAT_MS * 3, true).play).toBeNull();
  });

  it("plays one sound for several new requests, at the loudest level", () => {
    const step = stepAlerts(EMPTY, [bill("b"), call("a")], 0, true);
    expect(step.fresh).toHaveLength(2);
    expect(step.play).toEqual({ volume: 1 });
  });

  it("stops repeating once the banner is closed", () => {
    const first = stepAlerts(EMPTY, [call("a")], 0, true);
    const closed = closeAlert(first.state, "a");
    expect(stepAlerts(closed, [call("a")], REPEAT_MS, true).play).toBeNull();
  });

  it("does not count a sound that could not play, and rings once the sound is on", () => {
    const silent = stepAlerts(EMPTY, [call("a")], 0, false);
    expect(silent.fresh).toHaveLength(1);
    expect(silent.play).toBeNull();
    expect(silent.state.a?.plays).toBe(0);
    const on = stepAlerts(silent.state, [call("a")], 5000, true);
    expect(on.fresh).toEqual([]);
    expect(on.play).toEqual({ volume: 1 });
  });
});

describe("bannerRows", () => {
  it("shows the newest three and counts the rest", () => {
    const open = [call("a", 1), call("b", 2), call("c", 3), call("d", 4), call("e", 5)];
    const { shown, more } = bannerRows(open, EMPTY);
    expect(shown.map((r) => r.id)).toEqual(["e", "d", "c"]);
    expect(more).toBe(2);
  });

  it("leaves out closed banners", () => {
    const open = [call("a", 1), call("b", 2)];
    const state = closeAlert(stepAlerts(EMPTY, open, 0, true).state, "b");
    expect(bannerRows(open, state).shown.map((r) => r.id)).toEqual(["a"]);
    expect(bannerRows(open, state).more).toBe(0);
  });
});
