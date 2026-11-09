import type { SendResult } from "@/lib/offline/outbox";
import type { TicketStatus } from "./board-model";

type RpcError = { code: string; message: string; details: string | null; hint: string | null };

const STATUSES: readonly TicketStatus[] = ["new", "cooking", "ready", "served", "cancelled"];

// How the outbox treats the answer to a queued kitchen action. The database
// does compare-and-set (api.set_ticket_status): the same move twice succeeds,
// a move from a status the ticket no longer has fails with stale_status.
export function classifyRpcResult(res: { status: number; error: RpcError | null }): SendResult<TicketStatus> {
  const { status, error } = res;
  if (!error) return { kind: "ok" };
  if (status === 0 || status >= 500 || status === 401 || status === 408 || status === 429) {
    return { kind: "retry", reason: error.message || `http_${status}` };
  }
  if (error.code === "RS409" && error.message === "stale_status") {
    const current = STATUSES.find((s) => s === error.details) ?? null;
    return { kind: "stale", current };
  }
  if (error.code === "P0002") return { kind: "stale", current: null };
  if (error.code === "42501") return { kind: "forbidden" };
  return { kind: "failed", reason: error.message || error.code };
}
