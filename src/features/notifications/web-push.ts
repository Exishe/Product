import "server-only";
import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign } from "node:crypto";

// Web push without a library (ADR-035, ADR-044): RFC 8291 message encryption
// (aes128gcm, RFC 8188) and RFC 8292 VAPID, on Node's crypto only.

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

const RECORD_SIZE = 4096;

export function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/=+$/, ""), "base64url");
}

function hmac(key: Buffer, data: Buffer): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

// HKDF with a single block of output (we never need more than 32 bytes).
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = hmac(salt, ikm);
  return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

// Encrypts one push message for a subscription. `testing` fixes the sender's
// key and the salt, for the RFC 8291 test vector only.
export function encryptPayload(
  plaintext: Buffer,
  keys: { p256dh: string; auth: string },
  testing?: { senderPrivateKey: Buffer; salt: Buffer },
): Buffer {
  const uaPublic = b64urlDecode(keys.p256dh);
  const authSecret = b64urlDecode(keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("invalid p256dh");
  if (authSecret.length !== 16) throw new Error("invalid auth secret");
  if (plaintext.length > RECORD_SIZE - 17 - 86) throw new Error("payload too large");

  const sender = createECDH("prime256v1");
  if (testing) sender.setPrivateKey(testing.senderPrivateKey);
  else sender.generateKeys();
  const asPublic = sender.getPublicKey();
  const ecdhSecret = sender.computeSecret(uaPublic);
  const salt = testing?.salt ?? randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // One record; 0x02 marks the last record (no padding).
  const body = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

// The VAPID Authorization header for one push service (RFC 8292).
export function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()): string {
  const publicKey = b64urlDecode(vapid.publicKey);
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error("invalid VAPID public key");
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: vapid.privateKey.replace(/=+$/, ""),
      x: publicKey.subarray(1, 33).toString("base64url"),
      y: publicKey.subarray(33, 65).toString("base64url"),
    },
    format: "jwk",
  });
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: vapid.subject,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString(
    "base64url",
  );
  return `vapid t=${unsigned}.${signature}, k=${vapid.publicKey.replace(/=+$/, "")}`;
}

export type PushMessage = { title: string; body: string; tag: string; url: string };

// The browsers' push services (Chrome, Firefox, Safari, Edge). Any other
// endpoint would make the server post to a host a café owner picked (SSRF),
// so it is never fetched and is reported as gone (security-review.md, M-1).
const PUSH_HOSTS =
  /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

export function isPushServiceEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.port === "" && url.username === "" && PUSH_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

// Sends one message to one device; returns the push service's HTTP status
// (0 when the request itself failed). 404 and 410 mean the device is gone.
export async function sendPush(
  subscription: PushSubscriptionKeys,
  message: PushMessage,
  vapid: VapidKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (!isPushServiceEndpoint(subscription.endpoint)) return 410;
  try {
    const body = encryptPayload(Buffer.from(JSON.stringify(message)), subscription);
    const res = await fetchImpl(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(subscription.endpoint, vapid),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "3600",
        Urgency: "high",
      },
      body: new Uint8Array(body),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    return res.status;
  } catch {
    return 0;
  }
}
