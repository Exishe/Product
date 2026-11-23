// Is a waiter call left unsent on this phone for this table? A key check only,
// so the menu need not carry the parsing in pending-request.ts: the question
// (call-waiter-button.tsx) reads, resends or drops the request itself.
import type { RequestKind } from "./pending-request";

export const requestKey = (tableId: string, kind: RequestKind) => `pativ:request:v1:${tableId}:${kind}`;

export function hasRequestLeft(storage: Pick<Storage, "getItem">, tableId: string): boolean {
  try {
    return storage.getItem(requestKey(tableId, "call_waiter")) !== null;
  } catch {
    return false;
  }
}
