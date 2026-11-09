import { defineConfig } from "@playwright/test";

// Local secrets for tests (demo owner password); absent in CI, where those tests skip.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local
}

// The cloud session ships its own Chromium; CI installs browsers for 1.65.
const chromiumPath = process.env.PW_CHROMIUM_PATH;
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: "off",
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  projects: [
    {
      name: "phone",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: "tablet", use: { browserName: "chromium", viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start -p ${port}`,
        url: `http://localhost:${port}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
