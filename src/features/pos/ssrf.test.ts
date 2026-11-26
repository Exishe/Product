import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBlockedAddress, isPublicHttpsUrl } from "./ssrf";

const resolvesTo = (...addresses: string[]) => async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

describe("SSRF guard", () => {
  it.each([
    "https://pos.example.am/pativ",
    "https://hooks.mersoft.am:8443/orders?cafe=1",
    "https://8.8.8.8/x",
  ])("accepts %s", (url) => expect(isPublicHttpsUrl(url)).toBe(true));

  it.each([
    "http://pos.example.am/hook",
    "https://localhost/x",
    "https://api.localhost/x",
    "https://127.0.0.1/x",
    "https://10.1.2.3/x",
    "https://172.16.0.1/x",
    "https://172.31.255.255/x",
    "https://192.168.0.10/x",
    "https://169.254.169.254/latest/meta-data",
    "https://0.0.0.0/",
    "https://[::1]/x",
    "https://[fd00::1]/x",
    "https://intranet/x",
    "https://printer.local/x",
    "https://user:pw@pos.example.am/x",
    "https://2130706433/", // 127.0.0.1 written as one number
    "https://0x7f000001/",
    "ftp://pos.example.am/",
    "not a url",
  ])("refuses %s", (url) => expect(isPublicHttpsUrl(url)).toBe(false));

  it("knows the blocked ranges", () => {
    expect(isBlockedAddress("172.15.0.1")).toBe(false);
    expect(isBlockedAddress("172.32.0.1")).toBe(false);
    expect(isBlockedAddress("100.64.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedAddress("fe80::1")).toBe(true);
    expect(isBlockedAddress("2a00:1450:4001::200e")).toBe(false);
  });

  it("checks where the name points at send time", async () => {
    await expect(assertPublicUrl("https://pos.example.am/x", resolvesTo("93.184.216.34"))).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("https://evil.example.am/x", resolvesTo("93.184.216.34", "10.0.0.5"))).rejects.toThrow(
      /private address/,
    );
    await expect(assertPublicUrl("https://rebind.example.am/x", resolvesTo("::1"))).rejects.toThrow(/private address/);
    await expect(
      assertPublicUrl("https://gone.example.am/x", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).rejects.toThrow(/does not resolve/);
    await expect(assertPublicUrl("https://127.0.0.1/x", resolvesTo("127.0.0.1"))).rejects.toThrow(/blocked_url/);
  });
});
