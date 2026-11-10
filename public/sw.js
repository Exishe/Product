// Pativ service worker, hand-written (ADR-029). One worker for the whole
// origin, since a scope has one service worker:
// - web push sent by /api/push: owner alerts (ADR-035), a guest's «your order
//   is ready» and a waiter's table calls and bills (ADR-049);
// - the installed staff app (ADR-048): the kitchen screen and the waiter
//   tablet open offline to the last screen they showed.
//
// What is cached, and nothing else:
// - hashed build files under /_next/static (scripts, styles, fonts) and the
//   app icons: cache first, they never change under the same name;
// - the HTML of the last staff screens (/kitchen/<station>, /waiter): network
//   first, so a device online always gets fresh data, and the cached copy is
//   only the last known state for when the network is gone.
// Never cached: anything from another origin (Supabase, its realtime socket),
// /api/*, server actions and other non-GET requests, React Server Component
// fetches, guest and admin pages.

const VERSION = "2";
const STATIC_CACHE = `pativ-static-v${VERSION}`;
const PAGE_CACHE = `pativ-staff-pages-v${VERSION}`;
const CACHES = [STATIC_CACHE, PAGE_CACHE];
// Inside PAGE_CACHE: the path of the last staff screen this device showed.
const LAST_SCREEN = "/__pativ/last-staff-screen";
const STAFF_SCREEN = /^\/(?:kitchen\/[0-9a-f-]{36}|waiter)$/i;
const MAX_PAGES = 3;
const SHELL = ["/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pativ-") && !CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname);
const pageKey = (url) => `${url.origin}${url.pathname}`;

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await cache.put(request, response.clone());
  return response;
}

async function rememberScreen(url, response) {
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(pageKey(url), response);
  await cache.put(LAST_SCREEN, new Response(url.pathname));
  // Keep only the newest few screens (a kitchen with two stations, the waiter app).
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname !== LAST_SCREEN);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(old);
}

async function forgetScreen(url) {
  const cache = await caches.open(PAGE_CACHE);
  await cache.delete(pageKey(url));
  const last = await cache.match(LAST_SCREEN);
  if (last && (await last.text()) === url.pathname) await cache.delete(LAST_SCREEN);
}

const isHtml = (response) => (response.headers.get("content-type") ?? "").includes("text/html");

// A staff screen: the network when there is one, else the copy from the last visit.
async function staffScreen(request, url) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && !response.redirected && isHtml(response)) {
      await rememberScreen(url, response.clone());
    } else if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403 || response.status === 404) {
      // A disconnected device is sent to /pair: its old screen must not come back offline.
      await forgetScreen(url);
    }
    return response;
  } catch (error) {
    const cached = await (await caches.open(PAGE_CACHE)).match(pageKey(url));
    if (cached) return cached;
    throw error;
  }
}

// The installed app starts at /pair?source=app: go to the last staff screen if
// there is one, so a kitchen tablet reopens on its board, even offline.
async function openApp(request) {
  const last = await (await caches.open(PAGE_CACHE)).match(LAST_SCREEN);
  if (last) return Response.redirect(new URL(await last.text(), self.location.origin).href, 302);
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode !== "navigate") return;
  if (url.pathname === "/pair" && url.searchParams.get("source") === "app") {
    event.respondWith(openApp(request));
    return;
  }
  if (STAFF_SCREEN.test(url.pathname)) event.respondWith(staffScreen(request, url));
});

// A staff screen opened before this worker controlled the page tells it which
// files it loaded, so the first visit is enough to open offline later.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "staff-screen" || typeof data.path !== "string" || !Array.isArray(data.files)) return;
  const url = new URL(data.path, self.location.origin);
  if (url.origin !== self.location.origin || !STAFF_SCREEN.test(url.pathname)) return;
  const files = data.files
    .filter((f) => typeof f === "string")
    .map((f) => new URL(f, self.location.origin))
    .filter((f) => f.origin === self.location.origin && isStatic(f));
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) =>
        Promise.all(files.map((f) => cache.match(f.href).then((hit) => hit ?? cache.add(f.href).catch(() => undefined)))),
      ),
      fetch(url.href, { credentials: "same-origin", redirect: "manual" })
        .then((response) => {
          if (response.ok && response.type === "basic" && isHtml(response)) return rememberScreen(url, response);
          return undefined;
        })
        .catch(() => undefined),
    ]).then(() => event.source?.postMessage({ type: "staff-screen-cached", path: url.pathname })),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Pativ";
  // Owner alerts, a guest's «your order is ready» and a waiter's table call all
  // come this way (ADR-035, ADR-049). A tag per table or order makes a repeat
  // replace the earlier notification; renotify makes the replacement buzz again.
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag,
      renotify: tag !== undefined && data.renotify === true,
      icon: "/icon.svg",
      data: { url: safePath(data.url) },
    }),
  );
});

// Only a path on this origin ("/waiter", "/hy/m/…/order?t=…") may be opened by
// a tap; anything else (another site, "//host") goes to the admin.
function safePath(value) {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/admin";
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data?.url), self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      // The screen is already open: show it. The same page with another link
      // (a guest's status page with a new sticker token) is navigated.
      const same = windows.find((w) => w.url === target.href);
      if (same && "focus" in same) return same.focus();
      const samePage = windows.find((w) => new URL(w.url).pathname === target.pathname);
      if (samePage && "navigate" in samePage) {
        const moved = await samePage.navigate(target.href).catch(() => null);
        return (moved ?? samePage).focus();
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
