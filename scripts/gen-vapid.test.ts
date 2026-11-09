import { createECDH } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateVapidKeys } from "./gen-vapid";

describe("generateVapidKeys", () => {
  it("makes a matching P-256 pair in the formats browsers and the push route expect", () => {
    const { publicKey, privateKey } = generateVapidKeys();
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    expect(ecdh.getPublicKey().toString("base64url")).toBe(publicKey);
    expect(generateVapidKeys().privateKey).not.toBe(privateKey);
  });
});
