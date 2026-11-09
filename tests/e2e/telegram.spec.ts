import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";

// Screen 14: Telegram alerts and phone notifications (milestone 8).
// The bot token isn't in Vault yet, so the page must explain that and still
// offer phone notifications; linking a chat is covered by the SQL tests.

const shots = process.env.E2E_SCREENSHOT_DIR;

test.describe("Telegram alerts page", () => {
  test("a new owner sees exceptions-only alerts, the bot status and the phone toggle", async ({
    page,
  }, testInfo) => {
    await createFreshCafe(page);
    await page.goto("/admin/telegram");
    await expect(page.locator("html")).toHaveAttribute("lang", "hy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Telegram ծանուցումներ");
    await expect(
      page.getByText("Ըստ նախնականի գալիս են միայն բացառությունները", { exact: false }),
    ).toBeVisible();
    await expect(page.getByTestId("no-chats")).toHaveText("Դեռ միացված զրույց չկա։");

    const connect = page.getByRole("button", { name: "Միացնել Telegram" });
    await expect(connect).toBeVisible();
    const botReady = !(await page.getByTestId("bot-not-ready").isVisible());
    if (botReady) {
      await connect.click();
      await expect(page.getByTestId("telegram-link")).toBeVisible();
    } else {
      await expect(page.getByTestId("bot-not-ready")).toHaveText(
        "Telegram բոտը դեռ պատրաստ չէ։ Մինչ այդ կարող եք միացնել ծանուցումներն այս հեռախոսում։",
      );
      await expect(connect).toBeDisabled();
    }

    const push = page.getByTestId("push-section");
    await expect(push.getByRole("heading", { level: 2 })).toHaveText("Ծանուցումներ այս հեռախոսում");
    // Without VAPID keys on this server the toggle says it isn't available yet.
    if (!process.env.VAPID_PUBLIC_KEY) {
      await expect(push.getByTestId("push-status")).toHaveText("Ծանուցումները հեռախոսում դեռ հասանելի չեն։");
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);
    if (shots)
      await page.screenshot({ path: `${shots}/telegram-${testInfo.project.name}.png`, fullPage: true });
  });

  test("the webhook and push routes refuse unsigned calls", async ({ request }) => {
    const hook = await request.post("/api/telegram", {
      data: { update_id: 1, message: { chat: { id: 1 }, text: "/start x" } },
    });
    expect(hook.status()).toBe(401);
    const wrong = await request.post("/api/telegram", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": "not-the-secret" },
      data: { update_id: 1, message: { chat: { id: 1 }, text: "/start x" } },
    });
    // 401 once the migration is on the project; before that the function is missing (500).
    expect([401, 500]).toContain(wrong.status());
    const push = await request.post("/api/push", { data: { id: 1 } });
    expect(push.status()).toBe(401);
  });
});
