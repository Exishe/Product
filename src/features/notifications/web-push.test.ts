import {
  createDecipheriv,
  createECDH,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  verify,
} from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { b64urlDecode, encryptPayload, sendPush, vapidAuthorization } from "./web-push";

// The receiving browser's side of RFC 8291, to check what we send.
function decrypt(message: Buffer, uaPrivate: Buffer, auth: Buffer): string {
  const salt = message.subarray(0, 16);
  const rs = message.readUInt32BE(16);
  const idLen = message.readUInt8(20);
  const asPublic = message.subarray(21, 21 + idLen);
  const ciphertext = message.subarray(21 + idLen);
  expect(rs).toBe(4096);
  const ua = createECDH("prime256v1");
  ua.setPrivateKey(uaPrivate);
  const h = (k: Buffer, d: Buffer) => createHmac("sha256", k).update(d).digest();
  const expand = (s: Buffer, ikm: Buffer, info: Buffer, n: number) =>
    h(h(s, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, n);
  const ikm = expand(
    auth,
    ua.computeSecret(asPublic),
    Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]),
    32,
  );
  const cek = expand(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = expand(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()]);
  expect(plain[plain.length - 1]).toBe(2);
  return plain.subarray(0, plain.length - 1).toString();
}

function browserKeys() {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = Buffer.from("0123456789abcdef");
  return {
    ua,
    keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    auth,
  };
}

// A throwaway VAPID pair, made in the test and never stored.
function throwawayVapid() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), b64urlDecode(jwk.x as string), b64urlDecode(jwk.y as string)]);
  return {
    publicKey: raw.toString("base64url"),
    privateKey: privateKey.export({ format: "jwk" }).d as string,
    subject: "mailto:alerts@pativ.test",
  };
}

describe("encryptPayload (RFC 8291)", () => {
  it("matches the RFC 8291 appendix A test vector", () => {
    const out = encryptPayload(
      Buffer.from("When I grow up, I want to be a watermelon"),
      {
        p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        auth: "BTBZMqHH6r4Tts7J_aSIgg",
      },
      {
        senderPrivateKey: b64urlDecode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"),
        salt: b64urlDecode("DGv6ra1nlYgDCS1FRnbzlw"),
      },
    );
    expect(out.toString("base64url")).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("round-trips an Armenian alert for a fresh browser key", () => {
    const { ua, keys, auth } = browserKeys();
    const text = JSON.stringify({ title: "Պատիվ", body: "Նոր պատվեր՝ սեղան 5, 6 500 ֏" });
    const out = encryptPayload(Buffer.from(text), keys);
    expect(decrypt(out, ua.getPrivateKey(), auth)).toBe(text);
    // A new sender key and salt every time
    expect(encryptPayload(Buffer.from(text), keys).equals(out)).toBe(false);
  });

  it("refuses malformed keys and oversized payloads", () => {
    const { keys } = browserKeys();
    expect(() => encryptPayload(Buffer.from("x"), { ...keys, p256dh: "AAAA" })).toThrow("invalid p256dh");
    expect(() => encryptPayload(Buffer.from("x"), { ...keys, auth: "AAAA" })).toThrow("invalid auth secret");
    expect(() => encryptPayload(Buffer.alloc(4000), keys)).toThrow("payload too large");
  });
});

describe("vapidAuthorization (RFC 8292)", () => {
  it("signs a JWT for the push service's origin that verifies with the public key", () => {
    const vapid = throwawayVapid();
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", vapid, 1_700_000_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, h, p, s, k] = m as unknown as [string, string, string, string, string];
    expect(k).toBe(vapid.publicKey);
    expect(JSON.parse(b64urlDecode(h).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(b64urlDecode(p).toString())).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 1_700_000_000 + 12 * 3600,
      sub: "mailto:alerts@pativ.test",
    });
    const raw = b64urlDecode(vapid.publicKey);
    const pub = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: raw.subarray(1, 33).toString("base64url"),
        y: raw.subarray(33).toString("base64url"),
      },
      format: "jwk",
    });
    expect(
      verify("sha256", Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: "ieee-p1363" }, b64urlDecode(s)),
    ).toBe(true);
  });
});

describe("sendPush", () => {
  it("posts the encrypted message with VAPID headers and returns the status", async () => {
    const { ua, keys, auth } = browserKeys();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    const msg = {
      title: "Պատիվ",
      body: "Փորձնական ծանուցում։",
      tag: "channel.test:1",
      url: "/admin/telegram",
    };
    const status = await sendPush(
      { endpoint: "https://push.example/abc", ...keys },
      msg,
      throwawayVapid(),
      fetchImpl as typeof fetch,
    );
    expect(status).toBe(201);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://push.example/abc");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(JSON.parse(decrypt(Buffer.from(init.body as Uint8Array), ua.getPrivateKey(), auth))).toEqual(msg);
  });

  it("returns 0 when the request fails", async () => {
    const { keys } = browserKeys();
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const msg = { title: "t", body: "b", tag: "x", url: "/" };
    expect(
      await sendPush(
        { endpoint: "https://push.example/abc", ...keys },
        msg,
        throwawayVapid(),
        fetchImpl as typeof fetch,
      ),
    ).toBe(0);
  });
});
