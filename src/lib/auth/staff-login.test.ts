import { describe, expect, it } from "vitest";
import {
  STAFF_EMAIL_DOMAIN,
  SUFFIX_PATTERN,
  USERNAME_PATTERN,
  isStaffEmail,
  loginIdentity,
  passwordProblem,
  staffEmail,
} from "./staff-login";
import { PASSWORD_ALPHABET, PASSWORD_LENGTH, generatePassword } from "./staff-password";

describe("staff e-mail domain", () => {
  it("is non-deliverable and never the purged test domain", () => {
    expect(STAFF_EMAIL_DOMAIN.endsWith(".invalid")).toBe(true);
    expect(staffEmail("blanca-waiter").toLowerCase().endsWith("@pativ.test")).toBe(false);
    expect(staffEmail("blanca-waiter")).toBe("blanca-waiter@staff.pativ.invalid");
  });
  it("recognises staff addresses", () => {
    expect(isStaffEmail("blanca-waiter@staff.pativ.invalid")).toBe(true);
    expect(isStaffEmail(" Blanca-Waiter@STAFF.pativ.invalid ")).toBe(true);
    expect(isStaffEmail("owner@example.am")).toBe(false);
    expect(isStaffEmail("x@evilstaff.pativ.invalid")).toBe(false);
  });
});

describe("loginIdentity", () => {
  it("treats a value with @ as an e-mail address", () => {
    expect(loginIdentity("Owner@Example.am")).toEqual({ kind: "email", email: "Owner@Example.am" });
    expect(loginIdentity("  a@b.am ")).toEqual({ kind: "email", email: "a@b.am" });
  });
  it("maps a username to the staff address, lower-cased", () => {
    expect(loginIdentity("blanca-kitchen-2")).toEqual({
      kind: "username",
      email: "blanca-kitchen-2@staff.pativ.invalid",
    });
    expect(loginIdentity(" Blanca-Waiter ")?.email).toBe("blanca-waiter@staff.pativ.invalid");
  });
  it("refuses what cannot be a username", () => {
    for (const v of ["", "   ", "a", "-ab", "ab-", "bad_name", "has space", "ünï", "a".repeat(65)]) {
      expect(loginIdentity(v)).toBeNull();
    }
  });
});

describe("username rules", () => {
  it("match the database check", () => {
    expect(USERNAME_PATTERN.test("blanca-waiter")).toBe(true);
    expect(USERNAME_PATTERN.test("ab")).toBe(false);
    expect(USERNAME_PATTERN.test("abc")).toBe(true);
    expect(USERNAME_PATTERN.test("Abc")).toBe(false);
    expect(SUFFIX_PATTERN.test("kitchen-2")).toBe(true);
    expect(SUFFIX_PATTERN.test("a")).toBe(true);
    expect(SUFFIX_PATTERN.test("a".repeat(15))).toBe(true);
    expect(SUFFIX_PATTERN.test("a".repeat(16))).toBe(false);
    expect(SUFFIX_PATTERN.test("-a")).toBe(false);
    expect(SUFFIX_PATTERN.test("a-")).toBe(false);
  });
});

describe("passwordProblem", () => {
  it("wants 8 characters and at most 72 bytes", () => {
    expect(passwordProblem("1234567")).toBe("short");
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("a".repeat(72))).toBeNull();
    expect(passwordProblem("a".repeat(73))).toBe("long");
    expect(passwordProblem("ա".repeat(37))).toBe("long"); // 2 bytes each
  });
});

describe("generatePassword", () => {
  it("is 10 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(PASSWORD_LENGTH);
      for (const c of p) expect(PASSWORD_ALPHABET).toContain(c);
    }
  });
  it("has none of 0 O 1 l I", () => {
    for (const c of "0O1lI") expect(PASSWORD_ALPHABET).not.toContain(c);
    expect(new Set(PASSWORD_ALPHABET).size).toBe(PASSWORD_ALPHABET.length);
  });
  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generatePassword()));
    expect(seen.size).toBe(500);
  });
  it("uses the whole alphabet", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const c of generatePassword()) seen.add(c);
    expect(seen.size).toBe(PASSWORD_ALPHABET.length);
  });
});
