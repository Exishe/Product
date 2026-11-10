import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test as base, expect } from "./fixtures";
import { ownerEmail, ownerPassword } from "./helpers";
import { trackConsole } from "./kitchen-helpers";
import { buildWorld, LOCALES, openScreen, SCREENS, SHOTS, type World } from "./screens";

// Task 11.1: every screen, in Armenian, Russian and English, at 390, 820 and
// 1280 px (the phone, tablet and desktop projects), with the longest names the
// database allows, scrolls only vertically. Screens that need a cloud
// migration not applied yet are skipped with the migration's name.

const test = base.extend<object, { world: World }>({
  world: [async ({ browser }, provide, info) => provide(await buildWorld(browser, info.project.use.baseURL)), { scope: "worker", timeout: 180_000 }],
});

// How far the page scrolls sideways, plus text that runs out of its own box
// or gets cut off by a box that clips (a long word wider than a button, a
// ticket wider than its column). Deliberate truncation with an ellipsis and
// rows that scroll sideways on purpose (tabs) are fine.
async function sideways(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const culprits: string[] = [];
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} «${(el.textContent ?? "").trim().slice(0, 30)}»`;
    const hiddenBySrOnly = (el: Element) => {
      for (let p: Element | null = el; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.position === "absolute" && s.clipPath !== "none" && s.width === "1px") return true;
        if (s.clip !== "auto" && s.position === "absolute") return true;
      }
      return false;
    };
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const texts = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
      if (texts.length === 0 || style.textOverflow === "ellipsis") continue;
      if (hiddenBySrOnly(el)) continue;
      // Native pickers, and rows meant to scroll sideways (tabs), are fine.
      if (el.closest('option, select, [class*="overflow-x-auto"], [class*="overflow-x-scroll"]')) continue;
      const rects = texts.flatMap((t) => {
        const range = document.createRange();
        range.selectNodeContents(t);
        return Array.from(range.getClientRects()).filter((r) => r.width > 0);
      });
      // The text has to stay inside every block box around it, up to the
      // first one that clips or scrolls (and inside that one too).
      for (let box: HTMLElement | null = el; box && box !== document.body; box = box.parentElement) {
        const s = getComputedStyle(box);
        if (s.display.startsWith("inline") && s.display !== "inline-block" && s.display !== "inline-flex" && s.display !== "inline-grid") continue;
        if (box !== el && (s.overflowX === "auto" || s.overflowX === "scroll")) break;
        const b = box.getBoundingClientRect();
        const left = b.left + parseFloat(s.borderLeftWidth) - 1;
        const right = b.right - parseFloat(s.borderRightWidth) + 1;
        if (rects.some((r) => r.right > right || r.left < left)) {
          culprits.push(`text ${describe(el)} runs out of ${describe(box)}`);
          break;
        }
        if (s.overflowX !== "visible") break;
      }
    }
    // Boxes that scroll sideways without meaning to (tab rows say so with overflow-x-auto).
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const s = getComputedStyle(el);
      if ((s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1 && !/overflow-x-(auto|scroll)/.test(el.className)) {
        culprits.push(`${describe(el)} scrolls sideways by ${el.scrollWidth - el.clientWidth}px`);
      }
    }
    return {
      scroll: Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth,
      culprits: [...new Set(culprits)].slice(0, 8),
    };
  });
}

test.describe("no sideways scrolling", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs .env.local for the dev project");

  for (const screen of SCREENS) {
    for (const locale of LOCALES) {
      test(`${screen.name} ${locale}`, async ({ browser, world, consoleErrors }, info) => {
        const blocked = screen.blocked?.(world);
        test.skip(Boolean(blocked), blocked ?? "");
        const use = info.project.use;
        const { context, page } = await openScreen(browser, world, screen, locale, {
          baseURL: use.baseURL,
          viewport: use.viewport ?? null,
          isMobile: Boolean(use.isMobile),
          hasTouch: Boolean(use.hasTouch),
        });
        trackConsole(page, consoleErrors);
        try {
          const res = await page.goto(screen.path(world, locale));
          expect(res?.status()).toBe(screen.status ?? 200);
          await screen.prepare?.(page, world, locale);
          await page.waitForTimeout(300);
          const result = await sideways(page);
          if (result.scroll > 0 || process.env.OVERFLOW_SHOTS) {
            mkdirSync(SHOTS, { recursive: true });
            await page.screenshot({ path: `${SHOTS}/overflow-${screen.name}-${locale}-${info.project.name}.png`, fullPage: true });
          }
          if (process.env.OVERFLOW_REPORT) console.log(`OVERFLOW ${screen.name} ${locale} ${result.scroll} ${JSON.stringify(result.culprits)}`);
          else expect(result, `${screen.name} in ${locale}`).toEqual({ scroll: 0, culprits: [] });
        } finally {
          if (screen.status) {
            const kept = consoleErrors.filter((e) => !e.includes(`status of ${screen.status}`));
            consoleErrors.splice(0, consoleErrors.length, ...kept);
          }
          await context.close();
        }
      });
    }
  }
});
