// Retries a call that failed for a passing reason (a timeout or a busy
// database), with short pauses in between. Anything the caller calls final,
// such as "this token is invalid", returns at once. `run` must not throw.
export type Attempt<T> = { ok: true; value: T } | { ok: false; transient: boolean };

export async function retryTransient<T>(
  run: () => Promise<Attempt<T>>,
  pausesMs: readonly number[] = [300, 900],
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<Attempt<T>> {
  let result = await run();
  for (const pause of pausesMs) {
    if (result.ok || !result.transient) return result;
    await sleep(pause);
    result = await run();
  }
  return result;
}
