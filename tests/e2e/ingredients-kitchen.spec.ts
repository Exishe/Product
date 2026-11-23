import { expect, test } from "./fixtures";
import { createCafeWithMenu } from "./guest-helpers";
import { loadCafe, pairKitchenDevice, revokeDevice, startShift } from "./kitchen-helpers";

// The kitchen's "Ingredient out" list (ADR-076): one tap marks an ingredient out,
// it stays out after a reload, and Back brings it in again. Needs migration
// 20261123250000_ingredients_substitutes on the dev project; until CI has applied
// it this test skips. Desktop only.
test("the kitchen marks an ingredient out with one tap; Back brings it in", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "desktop only");
  test.setTimeout(180_000);
  const cafe = await createCafeWithMenu({
    categories: [{ key: "hot", names: { hy: "Տաք ուտեստներ", ru: "Горячие блюда", en: "Hot dishes" } }],
    dishes: [{ key: "d0", category: "hot", names: { hy: "Տոլմա" }, price: 3200 }],
    tables: ["1"],
  });
  const api = cafe.owner;
  const probe = await api.from("ingredient_outages").select("location_id").limit(1);
  test.skip(
    probe.error !== null,
    "needs migration 20261123250000_ingredients_substitutes on the dev project",
  );

  for (const names of [
    { hy: "Ձու", ru: "Яйцо", en: "Egg" },
    { hy: "Կաթ", ru: "Молоко", en: "Milk" },
  ]) {
    const { error } = await api.schema("api").rpc("save_ingredient", {
      p_restaurant_id: cafe.restaurantId,
      p_ingredient_id: null as unknown as string,
      p_names: names,
      p_unit: "pcs",
    });
    if (error) throw error;
  }

  const kitchen = await loadCafe(api, cafe.slug);
  const device = await pairKitchenDevice(browser, api, kitchen, { width: 1280, height: 800 });
  try {
    const page = device.page;
    await page.goto(`/kitchen/${kitchen.kitchenStationId}`);
    if (await page.getByRole("button", { name: "Սկսել հերթափոխը" }).count()) await startShift(page);

    await page.getByTestId("ingredient-out-button").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("searchbox").fill("Ձու");
    await dialog.getByRole("button", { name: /^Ձու/ }).click();
    await expect(dialog.getByRole("heading", { name: "Հիմա սպառված է" })).toBeVisible();
    await expect(page.getByTestId("ingredient-out-count")).toHaveText("1");

    // Still out after a reload; Back brings it in.
    await page.reload();
    await page.getByTestId("ingredient-out-button").click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Հետ" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Հետ" }).click();
    await expect(page.getByTestId("ingredient-out-count")).toHaveCount(0);

    // Outs beyond the search's top 30 are still named, each with Back
    // (needs api.list_ingredient_outages, migration 20261123290000).
    const listProbe = await api.schema("api").rpc("list_ingredient_outages", { p_location_id: kitchen.locationId });
    if (listProbe.error) {
      info.annotations.push({ type: "skipped part", description: "needs migration 20261123290000_ingredient_outage_list" });
    } else {
      for (let n = 0; n < 31; n++) {
        const r = await api.schema("api").rpc("save_ingredient", {
          p_restaurant_id: cafe.restaurantId,
          p_ingredient_id: null as unknown as string,
          p_names: { hy: `Ածխ ${String(n).padStart(2, "0")}`, ru: `Уголь ${n}`, en: `Coal ${n}` },
          p_unit: "pcs",
        });
        if (r.error) throw r.error;
      }
      // Sorts after all of them, so the search's 30 never shows it.
      const last = await api.schema("api").rpc("save_ingredient", {
        p_restaurant_id: cafe.restaurantId,
        p_ingredient_id: null as unknown as string,
        p_names: { hy: "Ֆիլե վերջին", ru: "Филе последнее", en: "Last fillet" },
        p_unit: "pcs",
      });
      if (last.error) throw last.error;
      const out = await api
        .schema("api")
        .rpc("set_ingredient_out", { p_location_id: kitchen.locationId, p_ingredient_id: last.data as string, p_out: true });
      expect(out.error).toBeNull();

      await page.reload();
      if (await page.getByRole("button", { name: "Սկսել հերթափոխը" }).count()) await startShift(page);
      await page.getByTestId("ingredient-out-button").click();
      const list = page.getByRole("dialog");
      await expect(list.getByText("Ֆիլե վերջին")).toBeVisible();
      await expect(list.getByText(/սպառված է։ Որպեսզի/)).toHaveCount(0);
      await list.getByRole("button", { name: "Հետ" }).click();
      await expect(page.getByTestId("ingredient-out-count")).toHaveCount(0);
      await expect(list.getByText("Ֆիլե վերջին")).toHaveCount(0);
    }
  } finally {
    await device.context.close();
    await revokeDevice(api, device.memberId);
  }
});
