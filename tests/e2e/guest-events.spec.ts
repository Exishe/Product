import { expect, test } from "./fixtures";
import { createTestCafe } from "./guest-menu-fixture";

// Guest event tracking (ADR-072): opening a dish and adding it sends an
// anonymous batch in the background. Needs migration 20261123195000_guest_events
// on the dev project; until CI has applied it this test skips.
const ZERO = "00000000-0000-0000-0000-000000000000";

test("opening a dish and adding it records anonymous events", async ({ page }) => {
  test.setTimeout(120_000);
  const cafe = await createTestCafe();
  const probe = await cafe.owner.schema("api").rpc(
    "record_guest_events" as never, // not in the generated types until they are refreshed
    { p_location_id: ZERO, p_session: "probe-session", p_events: [] } as never,
  );
  test.skip(
    probe.error?.code === "PGRST202",
    "needs migration 20261123195000_guest_events on the dev project",
  );

  const bodies: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/rpc/record_guest_events")) bodies.push(req.postData() ?? "");
  });
  await page.goto(`/en/m/${cafe.slug}/main`);
  await page
    .getByTestId("dish")
    .filter({ hasText: "Armenian coffee" })
    .getByRole("button", { name: "Add Armenian coffee" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Armenian coffee" });
  await sheet.getByRole("button", { name: /^Add/ }).click();
  await expect(sheet).toBeHidden();

  // The batch goes out within ~5 s (or at once when the page is hidden).
  await expect.poll(() => bodies.join(""), { timeout: 15_000 }).toContain("item_add");
  const sent = bodies.join("");
  expect(sent).toContain("item_view");
  expect(sent).not.toMatch(/name|phone|email/i);

  await expect
    .poll(
      async () =>
        (await cafe.owner.from("guest_events").select("kind").eq("location_id", cafe.locationId)).data
          ?.map((r) => r.kind)
          .sort(),
      { timeout: 15_000 },
    )
    .toEqual(expect.arrayContaining(["item_add", "item_view"]));
});
