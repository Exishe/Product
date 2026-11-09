import { describe, expect, it } from "vitest";
import { clearGuestSession, loadGuestSession, saveGuestSession } from "./guest-session";

const storage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("guest session memory", () => {
  it("returns the session only for the same table and the same anonymous user", () => {
    const s = storage();
    saveGuestSession(s, "t9", "user-a", "gs-1");
    expect(loadGuestSession(s, "t9", "user-a")).toBe("gs-1");
    expect(loadGuestSession(s, "t9", "user-b")).toBeNull();
    expect(loadGuestSession(s, "t10", "user-a")).toBeNull();
    clearGuestSession(s, "t9");
    expect(loadGuestSession(s, "t9", "user-a")).toBeNull();
  });

  it("ignores damaged data", () => {
    const s = storage();
    s.setItem("pativ:guest:v1:t9", "{");
    expect(loadGuestSession(s, "t9", "user-a")).toBeNull();
  });
});
