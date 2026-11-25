import { describe, expect, it, vi } from "vitest";
import { retryTransient, type Attempt } from "./retry";

const noSleep = () => Promise.resolve();

describe("retryTransient", () => {
  it("returns the first success without retrying", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true, value: 1 });
    expect(await retryTransient(run, [10, 10], noSleep)).toEqual({ ok: true, value: 1 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("retries a passing failure and returns the later success", async () => {
    const run = vi
      .fn<() => Promise<Attempt<number>>>()
      .mockResolvedValueOnce({ ok: false, transient: true })
      .mockResolvedValueOnce({ ok: true, value: 2 });
    const sleep = vi.fn(noSleep);
    expect(await retryTransient(run, [300, 900], sleep)).toEqual({ ok: true, value: 2 });
    expect(sleep).toHaveBeenCalledWith(300);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("stops at once on a final failure", async () => {
    const run = vi.fn().mockResolvedValue({ ok: false, transient: false });
    expect(await retryTransient(run, [10, 10], noSleep)).toEqual({ ok: false, transient: false });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last pause", async () => {
    const run = vi.fn().mockResolvedValue({ ok: false, transient: true });
    expect(await retryTransient(run, [10, 10], noSleep)).toEqual({ ok: false, transient: true });
    expect(run).toHaveBeenCalledTimes(3);
  });
});
