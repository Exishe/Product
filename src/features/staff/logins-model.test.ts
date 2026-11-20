import { describe, expect, it } from "vitest";
import { parseStaffLogins } from "./logins-model";

describe("parseStaffLogins", () => {
  it("reads the rows of api.list_staff_logins", () => {
    const rows = parseStaffLogins([
      {
        member_id: "m1",
        username: "blanca-kitchen",
        role: "kitchen",
        station_id: "s1",
        station_name: "Kitchen",
        is_active: true,
        password_set: false,
        last_sign_in_at: null,
        created_at: "2026-11-20T10:00:00Z",
      },
      {
        member_id: "m2",
        username: "blanca-waiter",
        role: "waiter",
        is_active: false,
        password_set: true,
        last_sign_in_at: "2026-11-20T11:00:00Z",
      },
    ]);
    expect(rows).toEqual([
      {
        memberId: "m1",
        username: "blanca-kitchen",
        role: "kitchen",
        stationName: "Kitchen",
        isActive: true,
        passwordSet: false,
        lastSignInAt: null,
      },
      {
        memberId: "m2",
        username: "blanca-waiter",
        role: "waiter",
        stationName: null,
        isActive: false,
        passwordSet: true,
        lastSignInAt: "2026-11-20T11:00:00Z",
      },
    ]);
  });
  it("skips anything malformed and accepts a missing result", () => {
    expect(parseStaffLogins(null)).toEqual([]);
    expect(parseStaffLogins({})).toEqual([]);
    expect(
      parseStaffLogins([null, 3, { username: "x" }, { member_id: "m", username: "u", role: "owner" }]),
    ).toEqual([]);
  });
});
