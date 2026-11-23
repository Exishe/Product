import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";

// Owner reports (ADR-073): the Reports page shows its four sections. Needs
// migration 20261123230000_owner_reports on the dev project; set
// E2E_REPORTS_MIGRATION=applied once it is, until then this skips.
test("the owner opens Reports and sees the four sections", async ({ page }) => {
  test.skip(process.env.E2E_REPORTS_MIGRATION !== "applied", "needs migration 20261123230000_owner_reports");
  await createFreshCafe(page);
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Հաշվետվություններ" })).toBeVisible();
  await expect(page.getByTestId("reports-conversion")).toBeVisible();
  await expect(page.getByTestId("menu-matrix")).toBeVisible();
  await expect(page.getByTestId("reports-busy")).toBeVisible();
  await expect(page.getByTestId("reports-suggestions")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "no horizontal page scroll").toBe(0);
});
