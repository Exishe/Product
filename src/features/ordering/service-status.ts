// What the guest is told about their waiter call and bill request. The waiter's
// «Գնում եմ» resolves a request (api.resolve_service_request), so the guest
// page reads recently resolved calls too and shows them as "on the way" for a
// while, instead of the request just vanishing.
export type ServiceKind = "call_waiter" | "bring_bill";
export type ServiceRequest = {
  id: string;
  kind: ServiceKind;
  status: "open" | "acknowledged" | "resolved" | string;
  resolved_at?: string | null;
};
export type ServiceLine = "callOpen" | "callAnswered" | "billOpen";

/** How long «the waiter is on the way» stays after the waiter answered. */
export const ANSWERED_MS = 3 * 60_000;

/** The oldest resolved_at worth fetching. */
export const answeredSince = (now: number) => new Date(now - ANSWERED_MS).toISOString();

const answeredAt = (r: ServiceRequest) => (r.resolved_at ? Date.parse(r.resolved_at) : NaN);

/** An answer still on screen: resolved less than ANSWERED_MS ago, or acknowledged and not yet resolved. */
function answered(r: ServiceRequest, now: number): boolean {
  if (r.status === "acknowledged") return true;
  if (r.status !== "resolved") return false;
  const at = answeredAt(r);
  return Number.isFinite(at) && now - at < ANSWERED_MS;
}

/** Requests the waiter has not answered yet. */
export const openRequests = (requests: ServiceRequest[]) => requests.filter((r) => r.status === "open");

/**
 * The confirmations to show, bill first. Both can show at once. A call that
 * was answered replaces "your waiter has been told"; a new open call wins over
 * an old answer. `sent` covers the moment between a send and the next read.
 */
export function serviceLines(
  requests: ServiceRequest[],
  now: number,
  sent: ReadonlySet<ServiceKind>,
): ServiceLine[] {
  const live = (kind: ServiceKind, statuses: (s: string) => boolean) =>
    requests.some((r) => r.kind === kind && statuses(r.status));
  const lines: ServiceLine[] = [];
  if (live("bring_bill", (s) => s !== "resolved") || sent.has("bring_bill")) lines.push("billOpen");
  if (live("call_waiter", (s) => s === "open") || sent.has("call_waiter")) lines.push("callOpen");
  else if (requests.some((r) => r.kind === "call_waiter" && answered(r, now))) lines.push("callAnswered");
  return lines;
}

/** When the answered line should go away: the soonest expiry after `now`, or null. */
export function nextExpiry(requests: ServiceRequest[], now: number): number | null {
  const times = requests
    .filter((r) => r.kind === "call_waiter" && r.status === "resolved" && answered(r, now))
    .map((r) => answeredAt(r) + ANSWERED_MS);
  return times.length ? Math.min(...times) : null;
}
