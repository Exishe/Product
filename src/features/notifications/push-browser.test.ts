import { describe, expect, it } from "vitest";
import { keyBytes, pushAvailability, subscriptionPayload, type PushEnvironment } from "./push-browser";

const env = (over: Partial<PushEnvironment> = {}): PushEnvironment => ({
  apis: true,
  ios: false,
  standalone: false,
  vapidPublicKey: "BKey",
  permission: "default",
  ...over,
});

describe("pushAvailability", () => {
  it("is ready when the browser can push and nothing is blocked", () => {
    expect(pushAvailability(env())).toBe("ready");
    expect(pushAvailability(env({ permission: "granted" }))).toBe("ready");
  });
  it("tells an iPhone in Safari to install the page first", () => {
    expect(pushAvailability(env({ apis: false, ios: true }))).toBe("install");
  });
  it("calls an installed iPhone app or any other browser without the APIs unsupported", () => {
    expect(pushAvailability(env({ apis: false, ios: true, standalone: true }))).toBe("unsupported");
    expect(pushAvailability(env({ apis: false }))).toBe("unsupported");
  });
  it("reports a missing server key and a blocked permission", () => {
    expect(pushAvailability(env({ vapidPublicKey: null }))).toBe("unconfigured");
    expect(pushAvailability(env({ permission: "denied" }))).toBe("denied");
  });
  it("checks support before the key", () => {
    expect(pushAvailability(env({ apis: false, vapidPublicKey: null }))).toBe("unsupported");
  });
});

describe("keyBytes", () => {
  it("decodes base64url without padding", () => {
    expect([...keyBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...keyBytes("-_8")]).toEqual([251, 255]);
  });
});

describe("subscriptionPayload", () => {
  it("takes the endpoint and the two keys", () => {
    const sub = {
      endpoint: "https://fcm.googleapis.com/x",
      toJSON: () => ({ keys: { p256dh: "P", auth: "A" } }),
    };
    expect(subscriptionPayload(sub)).toEqual({
      endpoint: "https://fcm.googleapis.com/x",
      keys: { p256dh: "P", auth: "A" },
    });
  });
  it("leaves empty keys for the server to refuse", () => {
    expect(subscriptionPayload({ endpoint: "e", toJSON: () => ({}) }).keys).toEqual({ p256dh: "", auth: "" });
  });
});
