import { describe, expect, it } from "vitest";
import { ALLOWED, disallowedPackages, isAllowed } from "./licenses";

describe("isAllowed", () => {
  it("accepts permissive licenses on the Phase 2 allowlist", () => {
    for (const id of ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause", "0BSD", "BlueOak-1.0.0", "CC-BY-4.0"]) {
      expect(isAllowed(id, ALLOWED)).toBe(true);
    }
  });

  it("refuses copyleft licenses that would bind our code", () => {
    expect(isAllowed("GPL-3.0", ALLOWED)).toBe(false);
    expect(isAllowed("AGPL-3.0-only", ALLOWED)).toBe(false);
  });

  it("treats LGPL-3.0 -only and -or-later as LGPL-3.0", () => {
    expect(isAllowed("LGPL-3.0-or-later", ALLOWED)).toBe(true);
    expect(isAllowed("LGPL-3.0-only", ALLOWED)).toBe(true);
  });

  it("needs one side of an OR and both sides of an AND", () => {
    expect(isAllowed("(MIT OR GPL-3.0)", ALLOWED)).toBe(true);
    expect(isAllowed("(MIT AND GPL-3.0)", ALLOWED)).toBe(false);
    expect(isAllowed("(MIT AND Zlib)", new Set(["MIT", "Zlib"]))).toBe(true);
  });

  it("refuses a missing or custom license", () => {
    expect(isAllowed(undefined, ALLOWED)).toBe(false);
    expect(isAllowed("SEE LICENSE IN LICENSE.md", ALLOWED)).toBe(false);
    expect(isAllowed("UNLICENSED", ALLOWED)).toBe(false);
  });
});

describe("disallowedPackages", () => {
  it("lists only the packages that fail, with their license", () => {
    const lock = {
      packages: {
        "": { name: "pativ" },
        "node_modules/a": { license: "MIT" },
        "node_modules/b": { license: "GPL-2.0" },
        "node_modules/@scope/c": {},
      },
    };
    expect(disallowedPackages(lock, ALLOWED, () => undefined)).toEqual([
      { name: "b", license: "GPL-2.0" },
      { name: "@scope/c", license: undefined },
    ]);
  });

  it("falls back to the installed package.json when the lockfile has no license", () => {
    const lock = { packages: { "node_modules/d": {} } };
    expect(disallowedPackages(lock, ALLOWED, () => "ISC")).toEqual([]);
  });
});
