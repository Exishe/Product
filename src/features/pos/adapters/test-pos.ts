import type { SendJob, SendResult } from "./types";

// The built-in Test POS: nothing leaves Pativ. The send is "accepted" with
// TEST-<outbox id>, and the payload stays readable in the admin's recent sends.
export function sendTest(job: SendJob): SendResult {
  return { ok: true, externalId: `TEST-${job.id}` };
}
