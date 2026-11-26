import type { LookupAll } from "../ssrf";
import { sendIiko } from "./iiko";
import { sendPoster } from "./poster";
import { sendTest } from "./test-pos";
import type { Fetcher, SendJob, SendResult } from "./types";
import { sendWebhook } from "./webhook";

export type NetDeps = { fetcher: Fetcher; lookup: LookupAll };

/** One send through the connection's vendor. Never throws for a vendor problem. */
export async function sendJob(job: SendJob, net: NetDeps): Promise<SendResult> {
  switch (job.vendor) {
    case "test":
      return sendTest(job);
    case "webhook":
      return sendWebhook(job, net.fetcher, net.lookup);
    case "iiko":
    case "syrve":
      return sendIiko(job, net.fetcher, net.lookup);
    case "poster":
      return sendPoster(job, net.fetcher);
  }
}
