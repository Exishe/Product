import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";

test("an owner builds a menu by hand: a section, dishes in three languages, sizes, order", async ({
  page,
}) => {
  await createFreshCafe(page);
  await page.goto("/admin/menu");
  await expect(page.getByRole("heading", { name: "Ճաշացանկը դեռ դատարկ է" })).toBeVisible();

  await page.getByRole("button", { name: "Լրացնել ձեռքով" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Տաք ուտեստներ");
  await page.getByLabel("Անունը ռուսերեն").fill("Горячие блюда");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Տաք ուտեստներ" })).toBeVisible();

  // A dish with three names and a price typed with a space
  await page.getByRole("button", { name: "+ Ավելացնել ուտեստ" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Տոլմա");
  await page.getByLabel("Անունը ռուսերեն").fill("Толма");
  await page.getByLabel("Անունը անգլերեն").fill("Tolma");
  await page.getByLabel("Գինը, ֏").fill("1500.5");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Գրեք գինը ամբողջ դրամով, օրինակ՝ 2 500։")).toBeVisible();
  await page.getByLabel("Գինը, ֏").fill("3 200");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Պահված է")).toBeVisible();
  await expect(page.getByTestId("dish-row").filter({ hasText: "Տոլմա" })).toContainText("3 200 ֏");

  // A second dish, moved above the first
  await page.getByRole("button", { name: "+ Ավելացնել ուտեստ" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Խաշլամա");
  await page.getByLabel("Գինը, ֏").fill("4500");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByTestId("dish-row")).toHaveCount(2);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Խաշլամա" })
    .getByRole("button", { name: "Տեղափոխել վեր" })
    .click();
  await expect(page.getByTestId("dish-row").first()).toContainText("Խաշլամա");

  // An option group for sizes, attached to the tolma
  await page.goto("/admin/menu/options");
  await page.getByRole("button", { name: "+ Ավելացնել խումբ" }).click();
  await page.getByLabel("Խմբի անունը հայերեն").fill("Չափ");
  await page.getByLabel("Տարբերակ 1: Անունը հայերեն").fill("Փոքր");
  await page.getByRole("button", { name: "+ Ավելացնել տարբերակ" }).click();
  await page.getByLabel("Տարբերակ 2: Անունը հայերեն").fill("Մեծ");
  await page.getByLabel("Տարբերակ 2: Հավելավճար, ֏").fill("500");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Պահված է")).toBeVisible();

  await page.goto("/admin/menu");
  await page.getByTestId("dish-row").filter({ hasText: "Տոլմա" }).click();
  await page.getByLabel("Չափ").check();
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Պահված է")).toBeVisible();
  await page.reload();
  await page.getByTestId("dish-row").filter({ hasText: "Տոլմա" }).click();
  await expect(page.getByLabel("Չափ")).toBeChecked();
});

test("an owner adds a dish photo, marks a dish sold out for today and publishes", async ({ page }) => {
  await createFreshCafe(page);
  await page.goto("/admin/menu");
  await page.getByRole("button", { name: "Լրացնել ձեռքով" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Աղցաններ");
  await page.getByRole("button", { name: "Պահել" }).click();
  await page.getByRole("button", { name: "+ Ավելացնել ուտեստ" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Ամառային աղցան");
  await page.getByLabel("Գինը, ֏").fill("1800");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Պահված է")).toBeVisible();

  // A 3 MB phone photo goes up as a small WebP
  // Coloured tiles with grain: about 2.5 MB as a JPEG, over the bucket's 2 MB limit.
  const jpeg = await page.evaluate(() => {
    const [w, h, tile] = [3000, 2000, 25];
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    for (let y = 0; y < h; y += tile) {
      for (let x = 0; x < w; x += tile) {
        ctx.fillStyle = `hsl(${(x + y) % 360} 60% ${40 + ((x * y) % 30)}%)`;
        ctx.fillRect(x, y, tile, tile);
      }
    }
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const grain = (Math.random() - 0.5) * 24;
      for (let c = i; c < i + 3; c++) img.data[c] = (img.data[c] ?? 0) + grain;
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.92).split(",")[1] ?? "";
  });
  const buffer = Buffer.from(jpeg, "base64");
  expect(buffer.byteLength).toBeGreaterThan(2_000_000);
  await page.getByTestId("photo-input").setInputFiles({ name: "salad.jpg", mimeType: "image/jpeg", buffer });
  const photo = page.locator('img[src*="/menu-images/"]');
  await expect(photo).toBeVisible();
  await expect(page.getByText("Փոխել լուսանկարը")).toBeVisible();
  const src = (await photo.getAttribute("src")) as string;
  expect(src).toMatch(/\.webp$/);
  const stored = await page.request.get(src);
  expect(stored.ok()).toBe(true);
  expect((await stored.body()).byteLength).toBeLessThan(200_000);

  // Sold out for today, and it stays so after a reload
  await page.keyboard.press("Escape");
  await page.goto("/admin/menu");
  const row = page.getByRole("listitem").filter({ hasText: "Ամառային աղցան" });
  await row.getByRole("button", { name: "Այսօր չկա" }).click();
  await expect(row.getByRole("button", { name: "Այսօր չկա" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Ամառային աղցան" })
      .getByRole("button", { name: "Այսօր չկա" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Publishing
  await expect(page.getByText("Ճաշացանկը դեռ հրապարակված չէ։")).toBeVisible();
  await page.getByRole("button", { name: "Հրապարակել" }).click();
  await expect(page.getByText("Հրապարակված է։ Հյուրերն արդեն տեսնում են նոր ճաշացանկը։")).toBeVisible();
});
