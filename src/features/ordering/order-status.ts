// The one status line a guest sees for an order, derived from the order,
// kitchen and bill state exactly as public.order_display_status does.
export type OrderState = {
  status: "placed" | "accepted" | "rejected" | "cancelled";
  kitchen_status: "pending" | "cooking" | "ready" | "served";
  paid_at: string | null;
  possible_duplicate_of: string | null;
};
export type DisplayStatus = "received" | "accepted" | "cooking" | "ready" | "served" | "paid" | "rejected" | "cancelled";

export const STEPS = ["received", "accepted", "cooking", "ready", "served"] as const;

export function displayStatus(o: OrderState): DisplayStatus {
  if (o.status === "rejected" || o.status === "cancelled") return o.status;
  if (o.paid_at) return "paid";
  if (o.kitchen_status === "served") return "served";
  if (o.kitchen_status === "ready") return "ready";
  if (o.kitchen_status === "cooking") return "cooking";
  if (o.status === "accepted") return "accepted";
  return "received";
}

/** Position on the tracker; paid is past the last step, rejected and cancelled are off it. */
export function stepIndex(s: DisplayStatus): number {
  if (s === "paid") return STEPS.length;
  return (STEPS as readonly string[]).indexOf(s);
}

/** Something can still change for the guest, so the page keeps checking. */
export function isActive(o: OrderState): boolean {
  const s = displayStatus(o);
  return s !== "paid" && s !== "rejected" && s !== "cancelled";
}
