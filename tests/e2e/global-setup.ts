import { RUN_OWNER_ENV, signUpRunOwner } from "./run-owner";

// Signs up the one owner every worker shares (run-owner.ts). Workers are
// started after this and inherit the environment variable.
export default async function globalSetup(): Promise<void> {
  if (process.env[RUN_OWNER_ENV]) return;
  // Without the dev project's address only the tests that need no café can run.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;
  process.env[RUN_OWNER_ENV] = await signUpRunOwner();
  console.log(`[e2e] one sign-up for this run: ${process.env[RUN_OWNER_ENV]}`);
}
