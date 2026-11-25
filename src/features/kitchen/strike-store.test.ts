import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrikeResult } from "./actions";

const setLineStruck = vi.fn<(...args: unknown[]) => Promise<StrikeResult>>();
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => ({}) }));
vi.mock("./actions", () => ({ setLineStruck: (...args: unknown[]) => setLineStruck(...args) }));

const { sendStrike, strikeStoreFor } = await import("./strike-store");
const { lineKey } = await import("./board-model");

const storage = new Map<string, string>();
let stationNo = 0;
const station = () => `pativ-test-station-${++stationNo}`;
const key = lineKey("11111111-0000-0000-0000-000000000001", "22222222-0000-0000-0000-000000000001");
const key2 = lineKey("11111111-0000-0000-0000-000000000001", "22222222-0000-0000-0000-000000000002");

beforeEach(() => {
  storage.clear();
  setLineStruck.mockReset();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

function tap(storeKey: string, k: string, want: boolean) {
  const store = strikeStoreFor(storeKey);
  store.update((taps) => new Map(taps).set(k, { want, ackedAt: null }));
  return { store, sent: sendStrike(store, k, want) };
}

describe("a tap on a struck line", () => {
  it("is sent with the ticket and the line, and confirmed when the server accepts it", async () => {
    setLineStruck.mockResolvedValue({ kind: "ok", complete: false });
    const { store, sent } = tap(station(), key, true);
    await sent;
    expect(setLineStruck).toHaveBeenCalledWith(
      {},
      "11111111-0000-0000-0000-000000000001",
      "22222222-0000-0000-0000-000000000001",
      true,
    );
    expect(store.get().get(key)).toMatchObject({ want: true, ackedAt: expect.any(Number) });
  });

  it("tells the board when the server says every wanted line is struck", async () => {
    setLineStruck.mockResolvedValue({ kind: "ok", complete: true });
    const onComplete = vi.fn();
    const store = strikeStoreFor(station());
    store.callbacks = { onComplete, onFailed: vi.fn() };
    store.update((taps) => new Map(taps).set(key, { want: true, ackedAt: null }));
    await sendStrike(store, key, true);
    expect(onComplete).toHaveBeenCalledWith("11111111-0000-0000-0000-000000000001");
  });

  it("does not report completion for taking a strike back", async () => {
    setLineStruck.mockResolvedValue({ kind: "ok", complete: true });
    const onComplete = vi.fn();
    const store = strikeStoreFor(station());
    store.callbacks = { onComplete, onFailed: vi.fn() };
    store.update((taps) => new Map(taps).set(key, { want: false, ackedAt: null }));
    await sendStrike(store, key, false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("stays unconfirmed when the network fails, and goes through when sent again", async () => {
    setLineStruck.mockResolvedValueOnce({ kind: "retry" });
    const { store, sent } = tap(station(), key, true);
    await sent;
    expect(store.get().get(key)).toEqual({ want: true, ackedAt: null });
    expect(store.flight.has(key)).toBe(false);

    setLineStruck.mockResolvedValueOnce({ kind: "ok", complete: false });
    await sendStrike(store, key, true);
    expect(store.get().get(key)?.ackedAt).not.toBeNull();
  });

  it("is not sent while the browser is offline, and stays", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { store, sent } = tap(station(), key, true);
    await sent;
    expect(setLineStruck).not.toHaveBeenCalled();
    expect(store.get().get(key)).toEqual({ want: true, ackedAt: null });
  });

  it("is not sent while the board's rows carry no struck_at (no migration): no request, no console error", async () => {
    const { store, sent } = (() => {
      const st = strikeStoreFor(station());
      st.rowsShareStrikes = false;
      st.update((taps) => new Map(taps).set(key, { want: true, ackedAt: null }));
      return { store: st, sent: sendStrike(st, key, true) };
    })();
    await sent;
    expect(setLineStruck).not.toHaveBeenCalled();
    expect(store.get().get(key)).toEqual({ want: true, ackedAt: null });
  });

  it("sends the latest tap when the line was tapped again while the first was on its way", async () => {
    let release: (r: StrikeResult) => void = () => {};
    setLineStruck.mockImplementationOnce(() => new Promise<StrikeResult>((res) => (release = res)));
    setLineStruck.mockResolvedValueOnce({ kind: "ok", complete: false });
    const { store, sent } = tap(station(), key, true);
    // un-strike while the strike is in flight: the store holds the newest tap, nothing new is sent yet
    store.update((taps) => new Map(taps).set(key, { want: false, ackedAt: null }));
    await sendStrike(store, key, false);
    expect(setLineStruck).toHaveBeenCalledTimes(1);
    release({ kind: "ok", complete: false });
    await sent;
    expect(setLineStruck.mock.calls.map((c) => c[3])).toEqual([true, false]);
    expect(store.get().get(key)).toMatchObject({ want: false, ackedAt: expect.any(Number) });
  });

  it("is forgotten when the ticket has left Cooking, with no complaint", async () => {
    setLineStruck.mockResolvedValue({ kind: "gone" });
    const onFailed = vi.fn();
    const store = strikeStoreFor(station());
    store.callbacks = { onComplete: vi.fn(), onFailed };
    store.update((taps) => new Map(taps).set(key, { want: true, ackedAt: null }));
    await sendStrike(store, key, true);
    expect(store.get().has(key)).toBe(false);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("is forgotten, with a complaint, when the server refuses it for good", async () => {
    setLineStruck.mockResolvedValue({ kind: "failed" });
    const onFailed = vi.fn();
    const store = strikeStoreFor(station());
    store.callbacks = { onComplete: vi.fn(), onFailed };
    store.update((taps) => new Map(taps).set(key, { want: true, ackedAt: null }));
    await sendStrike(store, key, true);
    expect(store.get().has(key)).toBe(false);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it("stays on this screen alone, and is not sent again, on a database without the function", async () => {
    setLineStruck.mockResolvedValue({ kind: "unsupported" });
    const { store, sent } = tap(station(), key, true);
    await sent;
    expect(store.get().get(key)).toEqual({ want: true, ackedAt: null });
    expect(store.supported).toBe(false);
    await sendStrike(store, key2, true);
    expect(setLineStruck).toHaveBeenCalledTimes(1);
  });
});

describe("what survives a reload", () => {
  it("keeps only the taps the server has not confirmed", async () => {
    setLineStruck.mockResolvedValueOnce({ kind: "retry" }).mockResolvedValueOnce({ kind: "ok", complete: false });
    const name = station();
    await tap(name, key, true).sent; // not confirmed
    await tap(name, key2, true).sent; // confirmed
    expect(JSON.parse(storage.get(name)!)).toEqual({ [key]: true });
  });

  it("reads them back, and the older list of struck keys too", () => {
    const name = station();
    storage.set(name, JSON.stringify({ [key]: false, [key2]: true }));
    expect(Object.fromEntries([...strikeStoreFor(name).get()].map(([k, s]) => [k, s.want]))).toEqual({
      [key]: false,
      [key2]: true,
    });

    const older = station();
    storage.set(older, JSON.stringify([key, key2])); // what the browser-only version wrote
    expect([...strikeStoreFor(older).get().values()].map((s) => [s.want, s.ackedAt])).toEqual([
      [true, null],
      [true, null],
    ]);
  });

  it("starts clean from unreadable saved data", () => {
    const name = station();
    storage.set(name, "{oops");
    expect(strikeStoreFor(name).get().size).toBe(0);
  });
});
