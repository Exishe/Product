import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("allows our own invite, admin and waiter paths", () => {
    expect(safeNext("/invite/abcDEF_123-xyz", "/admin")).toBe("/invite/abcDEF_123-xyz");
    expect(safeNext("/admin/staff", "/admin")).toBe("/admin/staff");
    expect(safeNext("/waiter", "/admin")).toBe("/waiter");
  });

  it("refuses other sites and tricks", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/admin/../../x", "/login", "", null]) {
      expect(safeNext(bad, "/admin")).toBe("/admin");
    }
  });
});
