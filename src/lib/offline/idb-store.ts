import { openDB, type IDBPDatabase } from "idb";
import { MemoryStore, type OutboxEntry, type OutboxStore } from "./outbox";

const STORE = "entries";

// The outbox in IndexedDB, one database per device user, so a tap survives a
// reload or a crashed tab. Falls back to memory where IndexedDB is missing or
// refused (private windows on some browsers): the queue still works, it just
// doesn't survive a reload.
export class IdbStore<A> implements OutboxStore<A> {
  private db: Promise<IDBPDatabase | null> | null = null;
  private readonly fallback = new MemoryStore<A>();

  constructor(private readonly name: string) {}

  private open(): Promise<IDBPDatabase | null> {
    if (!this.db) {
      this.db =
        typeof indexedDB === "undefined"
          ? Promise.resolve(null)
          : openDB(this.name, 1, {
              upgrade(db) {
                db.createObjectStore(STORE, { keyPath: "id" });
              },
            }).catch(() => null);
    }
    return this.db;
  }

  async list(): Promise<OutboxEntry<A>[]> {
    const db = await this.open();
    if (!db) return this.fallback.list();
    const rows = (await db.getAll(STORE)) as OutboxEntry<A>[];
    return rows.sort((a, b) => a.seq - b.seq);
  }

  async put(entry: OutboxEntry<A>): Promise<void> {
    const db = await this.open();
    if (!db) return this.fallback.put(entry);
    await db.put(STORE, entry);
  }

  async delete(id: string): Promise<void> {
    const db = await this.open();
    if (!db) return this.fallback.delete(id);
    await db.delete(STORE, id);
  }
}
