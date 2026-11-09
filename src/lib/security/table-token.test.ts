import { describe, expect, it } from "vitest";
import { isWellFormedToken } from "./table-token";

const GOOD = "AQGuePtNlnNHwoXHmzgwgdTiAAAAAQvxsaCic8v-p48pBQ";

describe("isWellFormedToken", () => {
  it("accepts 46 base64url characters", () => {
    expect(GOOD).toHaveLength(46);
    expect(isWellFormedToken(GOOD)).toBe(true);
    expect(isWellFormedToken("_".repeat(46))).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isWellFormedToken(GOOD.slice(1))).toBe(false);
    expect(isWellFormedToken(`${GOOD}A`)).toBe(false);
    expect(isWellFormedToken("")).toBe(false);
  });

  it("rejects characters outside base64url, padding and whitespace", () => {
    expect(isWellFormedToken(`${GOOD.slice(0, 45)}+`)).toBe(false);
    expect(isWellFormedToken(`${GOOD.slice(0, 45)}/`)).toBe(false);
    expect(isWellFormedToken(`${GOOD.slice(0, 45)}=`)).toBe(false);
    expect(isWellFormedToken(` ${GOOD.slice(1)}`)).toBe(false);
    expect(isWellFormedToken(`${GOOD.slice(0, 45)}\n`)).toBe(false);
    expect(isWellFormedToken(`${GOOD.slice(0, 44)}ա`)).toBe(false);
  });

  it("rejects anything that isn't a string", () => {
    expect(isWellFormedToken(undefined)).toBe(false);
    expect(isWellFormedToken(null)).toBe(false);
    expect(isWellFormedToken(["x"])).toBe(false);
  });
});
