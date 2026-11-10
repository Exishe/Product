import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { test as base, expect } from "./fixtures";
import { ownerEmail, ownerPassword } from "./helpers";
import { trackConsole } from "./kitchen-helpers";
import { buildWorld, openScreen, SCREENS, SHOTS, type World } from "./screens";

// Task 11.1: axe finds no serious or critical issue on any screen, at the
// three widths, in Armenian (the reference language; the overflow spec covers
// Russian and English). Screens that need a cloud migration not applied yet
// are skipped with the migration's name.

const test = base.extend<object, { world: World }>({
  world: [
    async ({ browser }, provide, info) => {
      await provide(await buildWorld(browser, info.project.use.baseURL));
    },
    { scope: "worker", timeout: 180_000 },
  ],
});

test.describe("accessibility", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs .env.local for the dev project");

  for (const screen of SCREENS) {
    test(screen.name, async ({ browser, world, consoleErrors }, info) => {
      const blocked = screen.blocked?.(world);
      test.skip(Boolean(blocked), blocked ?? "");
      const use = info.project.use;
      const { context, page } = await openScreen(browser, world, screen, "hy", {
        baseURL: use.baseURL,
        viewport: use.viewport ?? null,
        isMobile: Boolean(use.isMobile),
        hasTouch: Boolean(use.hasTouch),
      });
      trackConsole(page, consoleErrors);
      try {
        const res = await page.goto(screen.path(world, "hy"));
        expect(res?.status()).toBe(screen.status ?? 200);
        await expect(page.locator("html")).toHaveAttribute("lang", "hy");
        await screen.prepare?.(page, world, "hy");
        // Let transitions finish so colours are measured at rest.
        await page.waitForTimeout(400);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
        const bad = results.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(1, 3).join(" ")}`) }));
        if (bad.length > 0) {
          mkdirSync(SHOTS, { recursive: true });
          await page.screenshot({ path: `${SHOTS}/a11y-${screen.name}-${info.project.name}.png` });
        }
        if (process.env.A11Y_REPORT) console.log(`AXE ${screen.name} ${JSON.stringify(bad, null, 1)}`);
        else expect(bad, `axe on ${screen.name}`).toEqual([]);
      } finally {
        // A deliberate 404 or 403 page logs its own status.
        if (screen.status) {
          const kept = consoleErrors.filter((e) => !e.includes(`status of ${screen.status}`));
          consoleErrors.splice(0, consoleErrors.length, ...kept);
        }
        await context.close();
      }
    });
  }
});
