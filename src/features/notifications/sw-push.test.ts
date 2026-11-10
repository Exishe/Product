import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// public/sw.js run in a fake service worker scope: the push and notification
// click handlers (owner alerts, a guest's ready push, a waiter's table call).

type Handler = (event: Record<string, unknown>) => void;
type FakeClient = { url: string; focus: ReturnType<typeof vi.fn>; navigate?: ReturnType<typeof vi.fn> };

function load(clients: FakeClient[] = []) {
  const handlers: Record<string, Handler> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: "https://pativ.test" },
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () => Promise.resolve(clients),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve(null);
      },
      claim: () => Promise.resolve(),
    },
    skipWaiting: () => Promise.resolve(),
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    URL,
    caches: {},
    fetch: () => Promise.reject(new Error("offline")),
    Response,
  });
  return { handlers, shown, opened };
}

async function push(data: unknown) {
  const sw = load();
  let done: Promise<unknown> = Promise.resolve();
  sw.handlers.push!({
    data: { json: () => data, text: () => "" },
    waitUntil: (p: Promise<unknown>) => (done = p),
  });
  await done;
  return sw.shown[0]!;
}

describe("push", () => {
  it("shows an owner alert as before: tag, icon, admin link, no renotify", async () => {
    const n = await push({
      title: "Պատիվ",
      body: "Նոր պատվեր",
      tag: "order.placed:7",
      url: "/admin/telegram",
    });
    expect(n.title).toBe("Պատիվ");
    expect(n.options).toMatchObject({
      body: "Նոր պատվեր",
      tag: "order.placed:7",
      renotify: false,
      data: { url: "/admin/telegram" },
    });
  });

  it("shows a table call with its tag, renotify and the waiter app as the target", async () => {
    const n = await push({
      title: "Պատիվ",
      body: "Սեղան 5․ կանչում են",
      tag: "table:t5:service.call",
      url: "/waiter",
      renotify: true,
    });
    expect(n.options).toMatchObject({
      tag: "table:t5:service.call",
      renotify: true,
      data: { url: "/waiter" },
    });
  });

  it("opens the guest status page of a ready order", async () => {
    const url = "/hy/m/cafe/main/order?t=abc";
    const n = await push({
      title: "Պատիվ",
      body: "Ձեր պատվերը պատրաստ է՝ սեղան 5",
      tag: "order:o1",
      url,
      renotify: true,
    });
    expect(n.options).toMatchObject({ tag: "order:o1", renotify: true, data: { url } });
  });

  it("never renotifies without a tag", async () => {
    const n = await push({ body: "x", renotify: true, url: "/waiter" });
    expect(n.title).toBe("Pativ");
    expect(n.options.renotify).toBe(false);
    expect(n.options.tag).toBeUndefined();
  });

  it.each([
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example",
    "javascript:alert(1)",
    5,
    undefined,
  ])("sends a link that is not a path on this site (%j) to the admin", async (url) => {
    const n = await push({ body: "x", tag: "t", url });
    expect(n.options.data).toEqual({ url: "/admin" });
  });

  it("shows plain text when the payload is not JSON", async () => {
    const sw = load();
    let done: Promise<unknown> = Promise.resolve();
    sw.handlers.push!({
      data: {
        json: () => {
          throw new Error("not json");
        },
        text: () => "hello",
      },
      waitUntil: (p: Promise<unknown>) => (done = p),
    });
    await done;
    expect(sw.shown[0]!.options.body).toBe("hello");
  });
});

async function click(url: string | undefined, clients: FakeClient[]) {
  const sw = load(clients);
  const close = vi.fn();
  let done: Promise<unknown> = Promise.resolve();
  sw.handlers.notificationclick!({
    notification: { close, data: url === undefined ? undefined : { url } },
    waitUntil: (p: Promise<unknown>) => (done = p),
  });
  await done;
  expect(close).toHaveBeenCalled();
  return sw;
}

describe("notification click", () => {
  it("focuses the waiter app when it is already open", async () => {
    const waiter: FakeClient = { url: "https://pativ.test/waiter", focus: vi.fn() };
    const sw = await click("/waiter", [{ url: "https://pativ.test/admin", focus: vi.fn() }, waiter]);
    expect(waiter.focus).toHaveBeenCalled();
    expect(sw.opened).toEqual([]);
  });

  it("opens the waiter app when it is not open", async () => {
    const sw = await click("/waiter", [{ url: "https://pativ.test/admin", focus: vi.fn() }]);
    expect(sw.opened).toEqual(["https://pativ.test/waiter"]);
  });

  it("opens the guest's status page", async () => {
    const sw = await click("/ru/m/cafe/main/order?t=abc", []);
    expect(sw.opened).toEqual(["https://pativ.test/ru/m/cafe/main/order?t=abc"]);
  });

  it("navigates an open copy of the same page that has another link", async () => {
    const moved = { focus: vi.fn() };
    const open: FakeClient = {
      url: "https://pativ.test/ru/m/cafe/main/order?t=old",
      focus: vi.fn(),
      navigate: vi.fn(async () => moved),
    };
    const sw = await click("/ru/m/cafe/main/order?t=new", [open]);
    expect(open.navigate).toHaveBeenCalledWith("https://pativ.test/ru/m/cafe/main/order?t=new");
    expect(moved.focus).toHaveBeenCalled();
    expect(sw.opened).toEqual([]);
  });

  it("falls back to the admin for a missing or foreign target", async () => {
    expect((await click(undefined, [])).opened).toEqual(["https://pativ.test/admin"]);
    expect((await click("https://evil.example/", [])).opened).toEqual(["https://pativ.test/admin"]);
  });
});
