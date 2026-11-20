import { test, type BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database";

// One owner account for the whole test run (ADR-064).
//
// Supabase Auth limits sign-ups and sign-ins per IP address, and a full run
// used to sign up a new owner for every café it needed (51 or more). Now
// global-setup.ts signs up ONE owner, each worker signs in as that owner once,
// and every test still gets its own brand-new café: the owner simply owns
// many cafés ("A person can work at several cafés", membership.ts), and the
// browser is told which one to show with the `pativ-restaurant` cookie.
// Only onboarding.spec.ts signs up through the form, because that is its subject.

type Db = SupabaseClient<Database>;

export const RUN_OWNER_ENV = "E2E_RUN_OWNER_EMAIL";
export const RUN_OWNER_PASSWORD = "e2e-password-123";
// The same name as RESTAURANT_COOKIE in src/lib/auth/require-member.ts (server-only, so not imported).
const RESTAURANT_COOKIE = "pativ-restaurant";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

const plainClient = (): Db =>
  createClient<Database>(url(), key(), { auth: { persistSession: false, autoRefreshToken: false } });

type AuthAnswer = { error: { message: string; status?: number } | null };

// Auth answers 429 when the address has used up its sign-ups and sign-ins for
// the moment. Wait once and try again; a second refusal is a real failure.
export async function withRateLimitRetry<R extends AuthAnswer>(
  what: string,
  call: () => Promise<R>,
  waitMs = 65_000,
): Promise<R> {
  const first = await call();
  if (!first.error || !isRateLimit(first.error)) return first;
  console.warn(`[e2e] ${what}: ${first.error.message}; trying once more in ${Math.round(waitMs / 1000)} s`);
  await new Promise((done) => setTimeout(done, waitMs));
  return call();
}

export const isRateLimit = (error: { message: string; status?: number }): boolean =>
  error.status === 429 || /rate limit|too many requests/i.test(error.message);

// Called by global-setup.ts: the run's one sign-up.
export async function signUpRunOwner(): Promise<string> {
  const email = `e2e-run-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@pativ.test`;
  const { error } = await withRateLimitRetry("run owner sign-up", () =>
    plainClient().auth.signUp({
      email,
      password: RUN_OWNER_PASSWORD,
      options: { data: { display_name: "Թեստ" } },
    }),
  );
  if (error) throw new Error(`run owner sign-up: ${error.message}`);
  return email;
}

export type RunOwner = {
  email: string;
  password: string;
  // The owner's own session with the publishable key: RLS applies, and it sees every café of this run.
  client: Db;
  // The session as the app's own cookies, for a browser context.
  cookies: { name: string; value: string }[];
};

let once: Promise<RunOwner> | undefined;

// The run's owner, signed in once per worker process.
export function runOwner(): Promise<RunOwner> {
  once ??= (async () => {
    const email = process.env[RUN_OWNER_ENV];
    if (!email)
      throw new Error(
        "no run owner: global-setup.ts needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      );
    // The same client the app's server uses, so the cookies are exactly the app's.
    const jar = new Map<string, string>();
    const ssr = createServerClient<Database>(url(), key(), {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => {
          for (const c of cookies) {
            if (c.value) jar.set(c.name, c.value);
            else jar.delete(c.name);
          }
        },
      },
    });
    const signedIn = await withRateLimitRetry("run owner sign-in", () =>
      ssr.auth.signInWithPassword({ email, password: RUN_OWNER_PASSWORD }),
    );
    if (signedIn.error || !signedIn.data.session)
      throw new Error(`run owner sign-in: ${signedIn.error?.message ?? "no session"}`);
    const cookies = [...jar].map(([name, value]) => ({ name, value }));
    if (cookies.length === 0) throw new Error("run owner sign-in: the session cookies were not written");
    const client = plainClient();
    const { access_token, refresh_token } = signedIn.data.session;
    const { error } = await client.auth.setSession({ access_token, refresh_token });
    if (error) throw new Error(`run owner session: ${error.message}`);
    return { email, password: RUN_OWNER_PASSWORD, client, cookies };
  })();
  return once;
}

// Signs a browser context in as the run's owner, looking at one of their cafés.
// Without a café the owner is signed in and nothing is chosen (for /admin/new).
export async function signInAsRunOwner(
  context: BrowserContext,
  restaurantId: string | null,
  baseURL?: string,
): Promise<void> {
  const base = baseURL ?? test.info().project.use.baseURL;
  if (!base) throw new Error("signInAsRunOwner needs a baseURL");
  const owner = await runOwner();
  await context.addCookies([
    ...owner.cookies.map((c) => ({ ...c, url: base })),
    ...(restaurantId ? [{ name: RESTAURANT_COOKIE, value: restaurantId, url: base }] : []),
  ]);
}
