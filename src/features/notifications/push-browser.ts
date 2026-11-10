// Browser side of web push, shared by the owner's toggle, the waiter's toggle
// and the guest's «Notify me when it's ready» button (ADR-035, ADR-049).
// Everything here runs in the browser only; the pure parts are unit tested.

export type PushAvailability = "unsupported" | "install" | "unconfigured" | "denied" | "ready";

export type PushEnvironment = {
  /** serviceWorker, PushManager and Notification all exist. */
  apis: boolean;
  /** An iPhone or iPad, where push only works from a home-screen app. */
  ios: boolean;
  /** Running as an installed app (display-mode: standalone). */
  standalone: boolean;
  vapidPublicKey: string | null;
  permission: NotificationPermission | "none";
};

/** Why this browser can't be asked for permission, or "ready" if it can. */
export function pushAvailability(env: PushEnvironment): PushAvailability {
  if (!env.apis) return env.ios && !env.standalone ? "install" : "unsupported";
  if (!env.vapidPublicKey) return "unconfigured";
  if (env.permission === "denied") return "denied";
  return "ready";
}

export function readPushEnvironment(vapidPublicKey: string | null): PushEnvironment {
  const apis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return {
    apis,
    ios: /iPad|iPhone|iPod/.test(navigator.userAgent),
    standalone: window.matchMedia("(display-mode: standalone)").matches,
    vapidPublicKey,
    permission: apis ? Notification.permission : "none",
  };
}

/** The VAPID public key (base64url) as the bytes pushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** A PushSubscription as the database functions take it. */
export function subscriptionPayload(sub: {
  endpoint: string;
  toJSON(): { keys?: Record<string, string> };
}): BrowserSubscription {
  const json = sub.toJSON();
  return { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } };
}

export type SubscribeResult =
  { ok: true; subscription: BrowserSubscription } | { ok: false; reason: "denied" | "dismissed" | "failed" };

/** Asks for permission, registers the worker and subscribes this browser. */
export async function subscribeThisBrowser(vapidPublicKey: string): Promise<SubscribeResult> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const registration = await navigator.serviceWorker.ready;
    const sub =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(vapidPublicKey),
      }));
    return { ok: true, subscription: subscriptionPayload(sub) };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** This browser's current subscription, if any (without asking for anything). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}
