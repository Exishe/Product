import type { Fetcher, HttpReply } from "./types";

// The thin network layer every adapter shares: JSON in, JSON out, 10 s.
export const POS_FETCH_TIMEOUT_MS = 10_000;

export class PosNetworkError extends Error {}

export async function requestJson(
  fetcher: Fetcher,
  url: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string },
): Promise<HttpReply> {
  let res: Response;
  try {
    res = await fetcher(url, {
      method: init.method,
      headers: { Accept: "application/json", ...init.headers },
      body: init.body,
      redirect: "error", // a redirect could lead past the address check
      signal: AbortSignal.timeout(POS_FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    throw new PosNetworkError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network error");
  }
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

/** Network trouble, 408, 429 and 5xx are worth another try; other 4xx are not. */
export function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export const short = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);
