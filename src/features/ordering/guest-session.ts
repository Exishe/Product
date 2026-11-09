// The guest session this phone has at a table (api.guest_join_table), kept per
// table and per anonymous user, so the menu and the status page share it.
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Saved = { id: string; userId: string };

export const guestSessionKey = (tableId: string) => `pativ:guest:v1:${tableId}`;

export function loadGuestSession(storage: StorageLike, tableId: string, userId: string): string | null {
  try {
    const s = JSON.parse(storage.getItem(guestSessionKey(tableId)) ?? "null") as Saved | null;
    return s && s.userId === userId && typeof s.id === "string" ? s.id : null;
  } catch {
    return null;
  }
}

export function saveGuestSession(storage: StorageLike, tableId: string, userId: string, id: string): void {
  storage.setItem(guestSessionKey(tableId), JSON.stringify({ id, userId } satisfies Saved));
}

export function clearGuestSession(storage: StorageLike, tableId: string): void {
  storage.removeItem(guestSessionKey(tableId));
}
