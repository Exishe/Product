import { describe, expect, it } from "vitest";
import { pickMembership, type Membership } from "./membership";

const owner: Membership = { id: "m1", restaurantId: "r1", role: "owner", kind: "person", displayName: "Anna", locale: "hy" };
const waiterDevice: Membership = { id: "m2", restaurantId: "r1", role: "waiter", kind: "device", displayName: "Tablet", locale: "ru" };
const managerElsewhere: Membership = { id: "m3", restaurantId: "r2", role: "manager", kind: "person", displayName: "Anna", locale: "hy" };

describe("pickMembership", () => {
  it("finds nothing for a user with no memberships", () => {
    expect(pickMembership([], ["owner"], null)).toBeNull();
  });

  it("returns the membership whose role is allowed", () => {
    expect(pickMembership([owner], ["owner", "manager"], null)).toEqual(owner);
  });

  it("refuses a waiter device on an owner screen", () => {
    expect(pickMembership([waiterDevice], ["owner", "manager"], null)).toBeNull();
  });

  it("prefers the café the user last chose", () => {
    expect(pickMembership([owner, managerElsewhere], ["owner", "manager"], "r2")).toEqual(managerElsewhere);
  });

  it("falls back to the first allowed café when the chosen one doesn't qualify", () => {
    expect(pickMembership([owner, managerElsewhere], ["owner"], "r2")).toEqual(owner);
  });
});
