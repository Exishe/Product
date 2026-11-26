import "server-only";
import { lookup } from "node:dns/promises";
import type { NetDeps } from "./adapters";

// The real network for the adapters: global fetch and the system resolver.
export const realNet: NetDeps = {
  fetcher: (url, init) => fetch(url, init),
  lookup: (host) => lookup(host, { all: true, verbatim: true }),
};
