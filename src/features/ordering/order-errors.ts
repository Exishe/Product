// What a failed api.guest_place_order call means for the guest.
//  - offline: no answer, a timeout or a gateway error. The order may have been
//    created; keep the key and retry with the same request.
//  - everything else is a definite answer from PostgREST: the function raised,
//    its transaction rolled back, so no order exists for this attempt.
export type OrderErrorKind =
  | { kind: "offline" }
  | { kind: "auth" }
  | { kind: "rejoin" }
  | { kind: "sold_out"; itemId: string }
  | { kind: "menu_changed" }
  | { kind: "rate_limited" }
  | { kind: "ordering_off" }
  | { kind: "already_sent" }
  | { kind: "failed" };

type Failure = { status: number; error: { message: string; details?: string | null; code?: string | null } | null };

const MENU_CHANGED = ["item_unavailable", "invalid_modifiers", "unknown_modifier", "invalid_lines", "invalid_quantity", "menu_not_published"];
const ORDERING_OFF = ["ordering_disabled", "table_unavailable", "invalid_table_token", "plan_required"];

export function classifyOrderError({ status, error }: Failure): OrderErrorKind {
  if (status === 0 || status >= 500 || !error) return { kind: "offline" };
  const message = error.message;
  if (status === 401 || error.code === "PGRST301" || error.code === "PGRST303") return { kind: "auth" };
  if (message === "guest_session_invalid") return { kind: "rejoin" };
  if (message === "item_sold_out") return { kind: "sold_out", itemId: error.details ?? "" };
  if (message === "rate_limited") return { kind: "rate_limited" };
  if (message === "idempotency_key_reused") return { kind: "already_sent" };
  if (MENU_CHANGED.includes(message)) return { kind: "menu_changed" };
  if (ORDERING_OFF.includes(message)) return { kind: "ordering_off" };
  return { kind: "failed" };
}
