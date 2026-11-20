import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("allows our own invite, admin and waiter paths", () => {
    expect(safeNext("/invite/abcDEF_123-xyz", "/admin")).toBe("/invite/abcDEF_123-xyz");
    expect(safeNext("/admin/staff", "/admin")).toBe("/admin/staff");
    expect(safeNext("/waiter", "/admin")).toBe("/waiter");
    expect(safeNext("/kitchen/0f8fad5b-d9cb-469f-a165-70867728950e", "/admin")).toBe(
      "/kitchen/0f8fad5b-d9cb-469f-a165-70867728950e",
    );
  });

  it("refuses other sites and tricks", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/admin/../../x",
      "/kitchen/../admin",
      "/kitchen",
      "/login",
      "",
      null,
    ]) {
      expect(safeNext(bad, "/admin")).toBe("/admin");
    }
  });
});
