import { test as base, expect, type Browser } from "@playwright/test";
import { watchBrowser } from "./anon-count";

// Every e2e test fails if the page logs a console error or throws.
export const test = base.extend<{ consoleErrors: string[] }, { browser: Browser }>({
  // Counts anonymous sign-ins when E2E_ANON_LOG is set (anon-count.ts); otherwise the browser as it is.
  browser: [
    async ({ browser }, use, workerInfo) => {
      const stop = watchBrowser(browser, workerInfo.project.name);
      await use(browser);
      stop();
    },
    { scope: "worker" },
  ],
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(err.message));
      await use(errors);
      expect(errors, "console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
