// How late a ticket is, from its age on the server clock (screens.md §7):
// under 8 minutes normal, from 8 «Շտապել», from 12 «Ուշանում է».
export const HURRY_AFTER_MS = 8 * 60_000;
export const LATE_AFTER_MS = 12 * 60_000;

export type Lateness = "normal" | "hurry" | "late";

// Only food still waiting for the cook can be late: ready plates wait for the
// waiter, and cancellations wait for «Հասկացա».
export function classifyLateness(ageMs: number, status: "new" | "cooking" | "ready" | "void"): Lateness {
  if (status !== "new" && status !== "cooking") return "normal";
  if (ageMs >= LATE_AFTER_MS) return "late";
  if (ageMs >= HURRY_AFTER_MS) return "hurry";
  return "normal";
}

// Whole minutes, so a ticket's age is never mistaken for the clock in the top bar.
export function elapsedMinutes(ageMs: number): number {
  return Math.floor(Math.max(0, ageMs) / 60_000);
}
