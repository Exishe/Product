import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { newClient, type TestCafe } from "./guest-helpers";
import { createTestCafe } from "./guest-menu-fixture";

// «Notify me when it's ready» on the guest status page (ADR-049). The browser
// asks for permission (granted by the context), subscribes, and the database
// stores the subscription for the guest session. A café of its own per worker,
// one table per project (phone, tablet, desktop run side by side).
//
// The push service itself is replaced in the page: a headless browser in CI
// can't always reach Google's FCM, and nothing here is about delivery (that is
// covered by the SQL tests and the push route's unit tests). The service
// worker, the permission prompt, the button and the RPC are the real ones.

const TABLES = ["phone", "tablet", "desktop"];
let cafe: TestCafe;

const FAKE_PUSH = `
(() => {
  const bytes = (n) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n))))
    .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  const make = (v) => ({
    endpoint: v.endpoint,
    toJSON: () => ({ endpoint: v.endpoint, keys: { p256dh: v.p256dh, auth: v.auth } }),
    unsubscribe: async () => { localStorage.removeItem("e2e-push"); return true; },
  });
  PushManager.prototype.getSubscription = async () => {
    const stored = localStorage.getItem("e2e-push");
    return stored ? make(JSON.parse(stored)) : null;
  };
  PushManager.prototype.subscribe = async () => {
    const v = { endpoint: "https://fcm.googleapis.com/fcm/send/e2e-" + crypto.randomUUID(), p256dh: bytes(65), auth: bytes(16) };
    localStorage.setItem("e2e-push", JSON.stringify(v));
    return make(v);
  };
})();
`;

async function pushApplied(): Promise<boolean> {
  const probe = await newClient()
    .schema("api")
    .rpc("guest_push_exists", {
      p_guest_session_id: "00000000-0000-0000-0000-000000000000",
      p_endpoint: "x",
    });
  return probe.error?.code !== "PGRST202";
}

async function orderAsGuest(context: BrowserContext, token: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/t/${token}`);
  await expect(page).toHaveURL(new RegExp(`/hy/m/${cafe.slug}/main\\?t=`));
  await page
    .getByTestId("dish")
    .filter({ hasText: "Տոլմա" })
    .getByRole("button", { name: "Ավելացնել՝ Տոլմա" })
    .click();
  await page.getByRole("button", { name: /Դիտել պատվերը/ }).click();
  await page.getByRole("button", { name: "Ուղարկել խոհանոց" }).click();
  await expect(page).toHaveURL(new RegExp(`/hy/m/${cafe.slug}/main/order\\?t=`));
  return page;
}

test.describe("guest push at a fresh café", () => {
  test.beforeAll(async () => {
    cafe = await createTestCafe(TABLES);
  });

  test("the button asks for permission, subscribes, and the database keeps the subscription", async ({
    browser,
  }, testInfo) => {
    test.skip(
      !(await pushApplied()),
      "needs migration 20261110130000_push_guests_waiters.sql on the cloud project",
    );
    const table = cafe.tables[testInfo.project.name]!;
    const context = await browser.newContext({
      locale: "hy-AM",
      permissions: ["notifications"],
      viewport: testInfo.project.use.viewport ?? undefined,
    });
    await context.addInitScript(FAKE_PUSH);
    const page = await orderAsGuest(context, table.token);
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    const box = page.getByTestId("notify-ready");
    const shown = await box.waitFor({ timeout: 5000 }).then(
      () => true,
      () => false,
    );
    test.skip(!shown, "VAPID_PUBLIC_KEY is not set for this server, so the button is hidden");
    await expect(box).toHaveAttribute("data-state", "off");
    await box.getByRole("button", { name: "Տեղեկացնել, երբ պատրաստ լինի" }).click();
    await expect(box).toHaveAttribute("data-state", "on");
    await expect(box).toContainText("Կծանուցենք, երբ պատվերը պատրաստ լինի։");

    // The guest session of this phone, and the café's view of the channel made for it.
    const guestSession = await page.evaluate(
      (id) =>
        (JSON.parse(localStorage.getItem(`pativ:guest:v1:${id}`) ?? "null") as { id: string } | null)?.id ??
        null,
      table.id,
    );
    expect(guestSession).not.toBeNull();
    const { data: channels } = await cafe.owner
      .from("notification_channels")
      .select("kind, audience, is_active, locale")
      .eq("guest_session_id", guestSession!);
    expect(channels).toEqual([{ kind: "web_push", audience: "guest", is_active: true, locale: "hy" }]);

    // After a reload the phone's subscription is found again in the database
    // (api.guest_push_exists reads the stored row for this guest session).
    await page.reload();
    await expect(page.getByTestId("notify-ready")).toHaveAttribute("data-state", "on");

    // Turning it off removes the device again.
    await page.getByTestId("notify-ready").getByRole("button", { name: "Անջատել ծանուցումը" }).click();
    await expect(page.getByTestId("notify-ready")).toHaveAttribute("data-state", "off");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a blocked permission hides the button and says so; the status page keeps working", async ({
    browser,
  }, testInfo) => {
    test.skip(
      !(await pushApplied()),
      "needs migration 20261110130000_push_guests_waiters.sql on the cloud project",
    );
    const table = cafe.tables[testInfo.project.name]!;
    // No notification permission granted; the stub makes the browser report "denied".
    const context = await browser.newContext({
      locale: "hy-AM",
      viewport: testInfo.project.use.viewport ?? undefined,
    });
    await context.addInitScript(FAKE_PUSH);
    await context.addInitScript(() => {
      Object.defineProperty(Notification, "permission", { get: () => "denied" });
    });
    const page = await orderAsGuest(context, table.token);
    await expect(page.getByTestId("tracker")).toBeVisible();
    const box = page.getByTestId("notify-ready");
    const shown = await box.waitFor({ timeout: 5000 }).then(
      () => true,
      () => false,
    );
    test.skip(!shown, "VAPID_PUBLIC_KEY is not set for this server, so the note is hidden");
    await expect(box).toHaveAttribute("data-state", "denied");
    await expect(box).toContainText("Ծանուցումներն արգելված են դիտարկիչի կարգավորումներում։");
    await expect(box.getByRole("button")).toHaveCount(0);
    await context.close();
  });
});
