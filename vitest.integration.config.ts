import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI passes the variables directly
}

// Runs against the dev Supabase project over the network; not part of `npm test`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", testTimeout: 30_000 },
});
