import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { createTestCafe } from "./guest-menu-fixture";
import { pairWaiterDevice, panel, tableButton } from "./waiter-helpers";
import { signInAsRunOwner } from "./run-owner";

// Game rewards (ADR-072): the owner switches them on with level 2, a guest's
// game reaching level 2 is simulated through the claim call (the same call the
// game makes), the guest page keeps the reward, and the waiter sees it and
// marks it applied. Needs migration 20261123220000_game_rewards on the dev
// project; until CI has applied it this test skips.
const ZERO = "00000000-0000-0000-0000-000000000000";

test("rewards: owner switches on, a guest earns one, the waiter applies it", async ({ browser, isMobile, baseURL }) => {
  test.skip(isMobile, "desktop once; the 360 px admin check runs inside");
  test.setTimeout(240_000);
  const cafe = await createTestCafe(["1", "2"]);
  // The new functions are not in the generated types until the migration has reached the project.
  const owner = cafe.owner as unknown as SupabaseClient;
  const probe = await owner.schema("api").rpc("set_game_rewards", {
    p_location_id: ZERO,
    p_on: false,
    p_kind: "percent",
    p_level: 2,
    p_percent: null,
    p_text: null,
    p_game: null,
  });
  test.skip(probe.error?.code === "PGRST202", "needs migration 20261123220000_game_rewards on the dev project");

  // 1. The owner, on a 360 px phone, switches rewards on: level 2, 15 percent.
  const adminCtx = await browser.newContext({ baseURL, viewport: { width: 360, height: 780 } });
  await signInAsRunOwner(adminCtx, cafe.restaurantId, baseURL);
  const admin = await adminCtx.newPage();
  await admin.goto("/admin");
  const section = admin.getByTestId("home-rewards");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("rewards-status")).toContainText("անջատված");
  await section.getByTestId("rewards-switch").click();
  await section.getByTestId("rewards-level").fill("2");
  await section.getByTestId("rewards-percent").fill("15");
  for (const id of ["rewards-switch", "rewards-level", "rewards-percent", "rewards-game", "rewards-save"]) {
    const box = (await section.getByTestId(id).boundingBox())!;
    expect(box.height, `${id} is at least 44 px tall`).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width, `${id} fits at 360 px`).toBeLessThanOrEqual(360);
  }
  expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await section.getByTestId("rewards-save").click();
  await expect(section.getByTestId("rewards-status")).toContainText("միացված", { timeout: 15_000 });
  await adminCtx.close();

  // 2. A guest orders from table 1 on their phone.
  const guestCtx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: "hy-AM" });
  const guest = await guestCtx.newPage();
  await guest.goto(`/t/${cafe.tables["1"]!.token}`);
  await expect(guest).toHaveURL(/\?t=/);
  await guest.getByTestId("dish").filter({ hasText: "Տոլմա" }).getByRole("button", { name: "Ավելացնել՝ Տոլմա" }).click();
  await guest.getByRole("button", { name: /Դիտել պատվերը/ }).click();
  await guest.getByRole("button", { name: "Ուղարկել խոհանոց" }).click();
  await expect(guest).toHaveURL(/\/order\?t=/, { timeout: 15_000 });
  await expect(guest.getByTestId("games")).toBeVisible();
  // The offer is on the page before any game is played.
  await expect(guest.getByTestId("reward-offer")).toContainText("2", { timeout: 15_000 });
  await expect(guest.getByTestId("reward-note")).toHaveCount(0);

  // 3. "Level 2 reached": the same call the game host makes, with this phone's own session.
  const claim = await guest.evaluate(async () => {
    const authKey = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k))!;
    const token = (JSON.parse(localStorage.getItem(authKey)!) as { access_token: string }).access_token;
    const gsKey = Object.keys(localStorage).find((k) => k.startsWith("pativ:guest:v1:"))!;
    const guestSessionId = (JSON.parse(localStorage.getItem(gsKey)!) as { id: string }).id;
    return { token, guestSessionId };
  });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
  const call = async (fn: string, args: object, method = "POST") => {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method,
      headers: {
        apikey,
        Authorization: `Bearer ${claim.token}`,
        "Content-Type": "application/json",
        "Content-Profile": "api",
        "Accept-Profile": "api",
      },
      body: JSON.stringify(args),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const orderRows = await fetch(
    `${supabaseUrl}/rest/v1/orders?select=id&guest_session_id=eq.${claim.guestSessionId}`,
    { headers: { apikey, Authorization: `Bearer ${claim.token}` } },
  ).then((r) => r.json() as Promise<{ id: string }[]>);
  const orderId = orderRows[0]!.id;
  const args = { p_guest_session_id: claim.guestSessionId, p_order_id: orderId, p_game: "runner", p_level: 2 };
  // A claim needs the order to have waited a moment (15 s): ask until it is allowed.
  let res = await call("claim_game_reward", args);
  for (let i = 0; i < 12 && res.body.message === "too_early"; i++) {
    await guest.waitForTimeout(2_000);
    res = await call("claim_game_reward", args);
  }
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body).toMatchObject({ kind: "percent", percent: 15, level: 2, status: "open" });
  // Asking again returns the same reward.
  const again = await call("claim_game_reward", { ...args, p_level: 9 });
  expect(again.body.id).toBe(res.body.id);

  // 4. The guest's order page keeps it.
  await guest.reload();
  await expect(guest.getByTestId("reward-note")).toContainText("15% զեղչ", { timeout: 15_000 });
  await expect(guest.getByTestId("reward-note")).toContainText("Ցույց տվեք մատուցողին");

  // 5. The waiter sees it on the table and on the bill, and marks it applied.
  const device = await pairWaiterDevice(browser, cafe, baseURL);
  const waiterCtx = await browser.newContext({ baseURL, storageState: device.storageState, viewport: { width: 1180, height: 820 } });
  const waiter = await waiterCtx.newPage();
  await waiter.goto("/waiter");
  await tableButton(waiter, "1").click();
  const card = panel(waiter).getByTestId("reward-card");
  await expect(card).toContainText("Պարգև՝ 15% զեղչ (2-րդ մակարդակ)", { timeout: 20_000 });
  for (const id of ["reward-applied", "reward-dismiss"]) {
    expect((await card.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(tableButton(waiter, "2")).toBeVisible();
  await card.getByTestId("reward-applied").click();
  await expect(panel(waiter).getByTestId("reward-card")).toHaveCount(0);
  await waiterCtx.close();

  const { data: row } = await owner
    .from("game_reward_claims")
    .select("applied_at, applied_by, dismissed_at")
    .eq("order_id", orderId)
    .single();
  expect(row).toMatchObject({ dismissed_at: null });
  expect((row as unknown as { applied_at: string | null }).applied_at).not.toBeNull();
  const audit = await owner
    .from("audit_log")
    .select("action")
    .eq("action", "game_reward.applied")
    .eq("restaurant_id", cafe.restaurantId);
  expect(audit.data?.length ?? 0).toBe(1);
  await guestCtx.close();
});
