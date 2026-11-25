import { expect, test as base } from "./fixtures";
import type { TestCafe } from "./guest-helpers";
import { ownerEmail, ownerPassword } from "./helpers";
import {
  createWaiterCafe,
  guestRequest,
  hasFunction,
  pairWaiterDevice,
  SCREENSHOTS,
  seatGuest,
  type WaiterDevice,
} from "./waiter-helpers";

// ADR-088: a guest calls the waiter and the waiter's open screen shows a large
// banner and plays the café's call sound, without a reload. The sound is
// checked through `data-alerts-played` on the banner (the player was invoked);
// a browser test cannot hear it.

const test = base.extend<object, { cafe: TestCafe; device: WaiterDevice; sounds: boolean }>({
  cafe: [async ({}, provide) => provide(await createWaiterCafe()), { scope: "worker" }],
  device: [
    async ({ browser, cafe }, provide, info) =>
      provide(await pairWaiterDevice(browser, cafe, info.project.use.baseURL)),
    { scope: "worker" },
  ],
  sounds: [
    async ({ cafe }, provide) => {
      const { error } = await cafe.owner.from("locations").select("call_sound").limit(1);
      provide(!error && (await hasFunction(cafe.owner, "guest_service_request")));
    },
    { scope: "worker" },
  ],
  storageState: async ({ device }, provide) => provide(device.storageState),
});

test.skip(!ownerEmail || !ownerPassword, "needs .env.local for the dev project");
test.skip(({ isMobile }) => isMobile, "the waiter app is for tablets and larger");

test("a guest's call shows a banner and sounds on the open waiter screen", async ({ page, cafe, sounds }, info) => {
  test.skip(!sounds, "needs migration 20261124160000_staff_sounds on the dev project");
  test.setTimeout(90_000);

  await page.goto("/waiter");
  const toggle = page.getByTestId("sound-toggle");
  await expect(toggle).toHaveAttribute("data-state", "off");
  await toggle.click(); // the one tap a browser needs before a page may make a sound
  await expect(toggle).toHaveAttribute("data-state", "on");
  await expect(page.getByTestId("call-banner")).toHaveCount(0);

  const guest = await seatGuest(cafe, "5");
  const request = await guestRequest(guest, "call_waiter");

  const banner = page.getByTestId("call-banner").first();
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toContainText("Սեղան 5");
  await expect(page.getByTestId("call-alerts")).toHaveAttribute("data-alerts-played", /^[1-9]/);
  await page.screenshot({ path: `${SCREENSHOTS}/${info.project.name}-call-banner.png` });

  // "On my way" answers the call: the banner goes and the request is resolved.
  await page.getByTestId("call-banner-action").first().click();
  await expect(page.getByTestId("call-banner")).toHaveCount(0);
  await expect
    .poll(async () => (await cafe.owner.from("service_requests").select("status").eq("id", request).single()).data?.status)
    .toBe("resolved");
});
