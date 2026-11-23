import { expect, test } from "./fixtures";
import { createCafeWithMenu } from "./guest-helpers";
import { loadCafe, pairKitchenDevice, revokeDevice, startShift } from "./kitchen-helpers";

// Ingredient substitutes, guest side (ADR-076): an ingredient is out, the dish
// stays with its replacement, the guest sees a note, accepts a pop-up once,
// and the kitchen board shows "use ...". Needs migration
// 20261123250000_ingredients_substitutes on the dev project: it is merged but
// reaches the project only when CI applies it after a push, so until then this
// test skips (the same pattern as availability.spec.ts).
const SETUP_MS = 120_000;

test.describe("ingredient substitutes", () => {
  test.skip(({ isMobile }) => isMobile, "one desktop run covers the flow");

  test("a dish made with a replacement: note, pop-up once, order, kitchen sees «use …»", async ({ page, browser }) => {
    test.setTimeout(SETUP_MS + 120_000);
    const cafe = await createCafeWithMenu({
      categories: [{ key: "hot", names: { hy: "Տաք ուտեստներ", en: "Hot dishes" } }],
      dishes: [
        { key: "fish", category: "hot", names: { hy: "Ձուկ խորոված", ru: "Рыба на гриле", en: "Grilled fish" }, price: 4000 },
        { key: "tolma", category: "hot", names: { hy: "Տոլմա", ru: "Толма", en: "Tolma" }, price: 3200 },
      ],
      tables: ["1"],
    });
    // The generated types do not know the ingredient functions yet.
    const api = cafe.owner.schema("api") as unknown as {
      rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
    };
    const ingredient = async (names: Record<string, string>) =>
      api.rpc("save_ingredient", { p_restaurant_id: cafe.restaurantId, p_ingredient_id: null, p_names: names, p_unit: "g" });

    const trout = await ingredient({ hy: "Իշխան", ru: "Форель", en: "Trout" });
    test.skip(trout.error?.code === "PGRST202", "needs migration 20261123250000_ingredients_substitutes on the dev project (CI applies it after the push)");
    expect(trout.error).toBeNull();
    const salmon = await ingredient({ hy: "Սաղմոն", ru: "Лосось", en: "Salmon" });
    expect(salmon.error).toBeNull();
    const link = await api.rpc("set_item_ingredient", {
      p_item_id: cafe.items.fish!,
      p_ingredient_id: trout.data as string,
      p_quantity: 200,
      p_is_key: true,
      p_substitute_ingredient_id: salmon.data as string,
      p_price_delta: 500,
    });
    expect(link.error).toBeNull();
    expect((await api.rpc("set_ingredient_out", { p_location_id: cafe.locationId, p_ingredient_id: trout.data as string, p_out: true })).error).toBeNull();

    await page.goto(`/en/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`);
    const fish = page.getByTestId("dish").filter({ hasText: "Grilled fish" });
    await expect(fish.getByText("Today with Salmon")).toBeVisible();
    await expect(fish).toContainText("AMD 4,500"); // the price already includes the difference
    await expect(page.getByText(/ran out|sold out/i)).toHaveCount(0);

    // Adding asks once: "See other dishes" adds nothing.
    await fish.getByRole("button", { name: "Add Grilled fish" }).click();
    const dialog = page.getByTestId("subs-dialog");
    await expect(dialog).toContainText("Today this dish is made with Salmon instead of Trout. OK?");
    await expect(dialog).toContainText("New price: AMD 4,500");
    await dialog.getByRole("button", { name: "See other dishes" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /View order/ })).toHaveCount(0);

    // "Order" adds it; the second add of the same dish does not ask again.
    await fish.getByRole("button", { name: "Add Grilled fish" }).click();
    await page.getByTestId("subs-accept").click();
    await expect(page.getByRole("button", { name: /View order/ })).toBeVisible();
    await fish.getByRole("button", { name: "Add Grilled fish" }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: /View order/ }).click();
    await expect(page.getByTestId("cart-line").getByText("Today with Salmon")).toBeVisible();
    await page.getByRole("button", { name: "Send to the kitchen" }).click();
    await expect(page).toHaveURL(/\/order/, { timeout: 30_000 });
    await expect(page.getByTestId("line-sub")).toHaveText("Today with Salmon");

    // The kitchen board shows the replacement on the slip.
    const kitchenCafe = await loadCafe(cafe.owner, cafe.slug);
    const device = await pairKitchenDevice(browser, cafe.owner, kitchenCafe, { width: 1280, height: 800 });
    try {
      await startShift(device.page);
      await expect(device.page.getByTestId("line-substitute").first()).toContainText("Սաղմոն", { timeout: 30_000 });
    } finally {
      await device.context.close();
      await revokeDevice(cafe.owner, device.memberId);
    }
  });
});
