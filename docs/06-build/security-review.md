# Security and dependency review (Task 11.2)

Date: 10 Nov 2026. Scope: the whole repository at `claude/new-session-qjsyvc` (790c62b) plus the fixes below: application code under `src/`, the 17 migrations in `supabase/migrations/`, route handlers, server actions, the client bundle, the git history (54 commits), and every npm dependency. Nothing was run against the Supabase cloud project: the database review used the plain-Postgres harness (`scripts/test-sql.sh`), and the new migration is **not applied** to `restaurant-os-dev` yet.

Tools, all free: Semgrep 1.184.0 (community rules), gitleaks 8.28.0, a regex scan of `git log --all -p`, `npm audit`, `npm audit signatures`, `scripts/check-licenses.ts`, Playwright.

## Summary

| ID | Severity | Finding | Status |
|---|---|---|---|
| M-1 | Medium | Web push endpoints could be any `https://` host, so `/api/push` would POST to a host a café owner chose (SSRF / request reflector), following redirects | Fixed |
| M-2 | Medium | No Content-Security-Policy; no COOP or HSTS | Fixed (static CSP; see A-3) |
| L-1 | Low | `items.image_path`, `categories.image_path`, `restaurants.logo_path` accepted any text, so a manager could point a dish at another café's file or a `../` path | Fixed |
| L-2 | Low | `deleteDish` and `reorder` server actions passed ids to the database without Zod validation; `savePushSubscription` threw on a non-string user agent | Fixed |
| L-3 | Low | The server environment schema (variable names, not values) was bundled into client JavaScript because `src/lib/env.ts` mixed public and server settings | Fixed |
| L-4 | Low | The SQL harness didn't reproduce Supabase's default grants in `public`, so a migration that forgot its revokes would pass locally and leave a table open to `anon` in the cloud | Fixed (harness) |
| L-5 | Low (latent) | `members.pin_hash` (Stage 2 PIN switching, unused today) was readable by every member of the café, devices included; a PIN hash is cheap to brute-force offline | Fixed |
| I-1 | Info | `minimatch` 10.2.6 (GHSA-g3hv-75wg-m249, moderate) under `eslint-config-next` | Accepted (A-1) |
| I-2 | Info | 13 of the 29 direct dependencies were published less than 30 days ago, 10 within a week | Accepted (A-2) |

No critical or high findings. No secret is in the git history or the client bundle. Every SECURITY DEFINER function pins `search_path`, checks its caller and has explicit grants; every table has RLS on.

## 1. Semgrep

Two scans over every tracked file: `p/typescript p/react p/nextjs p/secrets p/sql-injection p/javascript p/owasp-top-ten` (598 rules), then `p/default p/xss p/jwt p/command-injection p/insecure-transport p/nodejsscan p/gitleaks` (802 rules). 11 results, all false positives:

| Rule | Where | Why it isn't a problem |
|---|---|---|
| `gcm-no-tag-length` | `web-push.test.ts:33` | The test's RFC 8291 decryptor; the tag is always the last 16 bytes and `setAuthTag` gets exactly 16 |
| `generic-api-key` ×2 | `web-push.test.ts:69`, `table-entry.test.ts:4` | The RFC 8291 appendix test vector and a fake table token |
| `node_insecure_random_generator` ×3 | `kitchen-board.tsx:216`, `waiter-app.tsx:162`, `guest-menu.tsx:22` | Toast ids and cart-line ids, local to the page. The idempotency key that matters uses `crypto.randomUUID` / `getRandomValues` (`pending-order.ts`) |
| `detect-non-literal-regexp` | `menu/actions.ts:148` | Built from the member's café uuid and a Zod-checked uuid; neither can carry regex syntax |
| `regex_dos` ×4 | `safe-next.ts`, `telegram-handler.ts`, `load.server.ts`, `guest-i18n.ts` | Anchored patterns without nested ambiguous quantifiers (`(\/[a-z0-9-]+)*` cannot overlap because each repetition starts with `/`); inputs are length-bounded |

## 2. Database: migrations, functions, RLS, storage

Reviewed from the catalog of the harness database after all migrations, plus the function sources.

- **SECURITY DEFINER functions (100 of 112 in `api`, `private` and `public`).** All have `search_path=""`. None is executable by `PUBLIC`. `anon` can call exactly five: `api.public_menu`, `api.resolve_table_token`, `api.telegram_update` (checks the webhook secret against Vault, constant-time via digests), `api.push_claim` and `api.push_report` (HMAC signature from Vault per outbox row and attempt). `authenticated` can call only the RLS helpers in `private`. Every other `api.*` function asserts the caller: `assert_restaurant_role` / `assert_location_role` / `assert_platform_admin`, `auth.uid()` ownership, or a rate limit plus `is_real_user()`. Functions that take nested ids (`save_item`, `save_modifier_group`, `reorder`, `add_menu_import_images`, `create_invitation`, `revoke_member`, `update_notification_channel`, `delete_item`) resolve the café from the row and check that every referenced category, prep area, modifier group, location or storage path belongs to it.
- **Tables (72).** RLS is on for all of them except `private.rate_limits`, which has no grants to any API role (accepted: the schema isn't exposed and only SECURITY DEFINER code touches it). 26 public tables have RLS on and no policies (outbox, counters, link codes, push subscriptions, and future modules: loyalty, stock, payment providers, AI conversations): they deny everything to API roles (at most a `select` grant). `anon` holds no table privilege at all; it reads through `api.*`. Policies use the `my_restaurant_ids` / `my_location_ids` helpers with role lists; menu tables are owner/manager only; `subscriptions` is owner only; guests see only their own sessions, orders, items and calls.
- **Storage.** One policy, `menu_files_write` on `storage.objects`, scopes `menu-images` and `menu-imports` to the café's own folder (`foldername(name)[1]`) for owners and managers. Realtime topics `loc:<id>` and `guest:<id>` are scoped the same way.

**M-1 fix.** `isPushServiceEndpoint` in `src/features/notifications/web-push.ts` allows only the browsers' push services (`fcm.googleapis.com`, `android.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`), https, no port, no credentials. `sendPush` never fetches anything else (it reports 410, so the database deletes the row) and no longer follows redirects. The server action checks the same list, and migration `20261110100000_security_review` adds `push_subscriptions_endpoint_push_service`, deleting any existing row that fails it (no such row can ever have received a push).

**L-1 fix.** The same migration adds check constraints: a dish photo must be `<restaurant>/items/<item>/<digits>.webp` (what the editor writes), a section picture and the logo must start with the café's folder and contain no `..` segment. They're `NOT VALID`, so old rows stay and every new write is checked; the owner can validate them later.

**L-5 fix.** The same migration replaces the table-wide `select` on `public.members` with a column list that leaves out `pin_hash`. PIN checks, when Stage 2 adds them, belong in a SECURITY DEFINER function.

### RLS coverage suite

`tests/integration/rls.test.ts` runs against the cloud and can't see unapplied migrations, so the coverage moved into the harness: `supabase/tests/sql/rls_coverage.sql` (55 checks).

- Catalog: RLS on every table; no private table granted; `anon` holds nothing on any table or view; no views; no policy-less table writable; every SECURITY DEFINER function pins `search_path`; nothing executable by `PUBLIC`; the exact `anon` and `private` call lists above.
- Two cafés built through the real `api.*` calls (menu, option group, table, publish, QR, invitation, Telegram link, push subscription, two device pairings, a redeemed kitchen tablet, a guest order and a call, a realtime message, a stored file). Café B has rows in 36 public tables.
- A sweep over **every** public table, generated from the catalog so a new table is covered automatically: rows of café B visible to, and rows touched by an `UPDATE` or `DELETE` from, the owner of A, a manager of A, A's kitchen tablet, a guest at A, a signed-in stranger and `anon` (each write is rolled back at once). Expected: zero everywhere, while the owner reads and changes their own café.
- Explicit inserts into B (category, dish, translation, table, stop list, station, menu, membership, moving a dish into B, uploading into B's storage folder) all fail; B's realtime channel and files stay invisible.
- A kitchen tablet reads none of the 27 owner-only tables of its own café and writes only the stop list; a guest reads no staff table and can't write orders, files or the staff channel.
- The L-1 and M-1 constraints.

Checked by mutation: replacing the `items` policy with `using (true)` makes the sweep report `items`.

**L-4 fix.** `docs/01-architecture/sql/00-supabase-stubs.sql` now sets Supabase's default privileges (`grant all on tables, functions, sequences in schema public to anon, authenticated, service_role`), so the harness sees what a migration would leave behind in the cloud. All 17 existing migrations pass with it.

## 3. Application code

- **Route handlers.** `/api/telegram`: rejects a missing or malformed secret header before any database call, caps the body at 64 KB, and the database compares the secret to Vault. `/api/push`: Zod-validates `{id, attempt, sig}`; the signature is checked in the database; now limited to push services (M-1). `/api/time`, `/api/health`: no input, no data. `/t/[token]`: a malformed token never reaches the database, slugs are re-checked before building the redirect (same origin, relative), and the error page escapes its text. `/admin/export/[kind]`: allowlisted kinds, `requireMember(['owner','manager'])`, RLS-scoped reads, formula-injection-safe CSV, `private, no-store`.
- **Server actions** (10 files). Every exported action calls `requireMember` with a role list (or `requirePlatformAdmin`, or is sign-in/sign-up/accept-invite) and parses its input with Zod; the database checks again. `deleteDish` and `reorder` now validate too (L-2). The kitchen and waiter helpers are not server actions: they call `api.*` from the device's own session.
- **Open redirects.** Sign-in and sign-up use `safeNext` (own paths only); other redirects are constant paths or a Zod-checked uuid.
- **Client bundle.** After `npm run build`, `.next/static` contains no secret patterns (Supabase secret keys, JWTs, Google/Anthropic keys, Telegram tokens, private keys) and none of the values of `.env.local`'s server variables. It did contain the server env schema (names only); `src/lib/env.server.ts` (`server-only`) now holds it (L-3).
- **Headers (M-2).** `next.config.ts` now sends a Content-Security-Policy (`default-src 'self'`; scripts, styles, fonts, workers and the manifest from our origin; `connect-src` and `img-src` add only the Supabase project, with `wss:` for Realtime; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`), `Cross-Origin-Opener-Policy: same-origin` and HSTS, besides the existing `nosniff`, `Referrer-Policy`, `Permissions-Policy` (now also `payment`, `usb`) and `X-Frame-Options: DENY`. A CSP violation logs a console error, which fails any e2e test (fixtures.ts), so the e2e runs below double as the CSP check.

## 4. Secret scan of the history

gitleaks over all 54 commits: 3 hits, none real: the RFC 8291 test vector, a fake table token in a unit test, and the publishable Supabase key in `.github/workflows/ci.yml` (public by design; it only works under RLS). A regex scan of `git log --all -p` (2.8 MB) for Supabase secret keys, JWTs, Google, Anthropic, OpenAI, GitHub and Vercel tokens, Telegram bot tokens, private-key blocks, Postgres URLs with passwords and VAPID private keys found nothing. Of the values in `.env.local`, only the demo owner's email address appears in history (it's in the seed); the password does not. CI pins every action to a commit SHA and sets `permissions`.

## 5. Dependencies

- `npm audit`: 0 vulnerabilities in production dependencies; 8 moderate in development, all one advisory (I-1). CI's `--audit-level=high` passes.
- `npm audit signatures`: 505 packages with verified registry signatures, 161 with verified provenance attestations. (A first run reported two invalid attestations; two reruns verified everything, and `next`'s lockfile integrity matches the registry, so it was a failed fetch of the attestation bundle.)
- `node scripts/check-licenses.ts`: 610 packages within the allowlist.
- **Added since Phase 2: nothing.** All 29 direct dependencies are in `docs/02-stack/planned-package.json` at the same exact versions, which `supply-chain-report.md` reviewed (publishers, downloads, licences). Seven planned packages were never added (`@sentry/nextjs`, `@tanstack/react-query`, `grammy`, `lucide-react`, `posthog-js`, `radix-ui`, `recharts`), which removes their transitive trees.
- **Install scripts** (4, unchanged): `@parcel/watcher` (builds from source only if asked), `@swc/core` (checks for its native binary) — both under `next-intl` —, `protobufjs` (version-scheme warning, under `@google/genai`), `fsevents` (macOS only, optional). All are the packages' long-standing scripts.
- **Ages.** 13 direct dependencies were published within 30 days, 10 within a week (`vitest` 5.1.0: 7 days; `next` and `eslint-config-next` 16.4.5: 6 days; `@supabase/supabase-js` 2.119.0: 5; `@anthropic-ai/sdk`, `@playwright/test`: 4; `@google/genai`, `tailwindcss`, `@tailwindcss/postcss`: 3; `supabase` CLI 3.1.0: 0). Every installed package has a verified registry signature, and all are exact-pinned with lockfile integrity hashes (I-2).

## Accepted risks

- **A-1 (I-1) `minimatch` advisory.** `dependency-audit.md` planned an npm `overrides` entry for `minimatch` `^11.0.1`. Tried: lint passes, but 11.x pulls in a new package, `@isaacs/nonrecursive-glob-match`, created on 26 Oct and published at 1.1.0 five days ago. Adding a two-week-old package to the toolchain is a larger supply-chain risk than the advisory, which is a denial of service through glob patterns that only this repository's ESLint config supplies. Revisit when `typescript-eslint` ships the fix itself.
- **A-2 (I-2) young releases.** The versions were chosen at the Phase 2 audit and haven't moved. Before the pilot's production deploy, re-run `npm audit signatures` and the supply-chain collector, and from then on take no release younger than 7 days.
- **A-3 CSP allows `'unsafe-inline'` scripts and styles.** Next.js's App Router injects inline bootstrap scripts; removing `'unsafe-inline'` needs a per-request nonce, which turns every page dynamic, including the guest menu that is rendered statically. The policy still blocks every external script, object and frame, and limits where data can go to our origin and the Supabase project. React escapes output, and the code has no `dangerouslySetInnerHTML`. Revisit with a nonce or hashes if a third-party script is ever added.
- **A-4 Supabase auth cookies aren't `HttpOnly`.** `@supabase/ssr` needs them readable by the browser client. Mitigated by the CSP and by short-lived access tokens; a stolen session of a revoked device is cut by `api.revoke_member`.
- **A-5 Anonymous sign-ups have no CAPTCHA yet.** Already an owner task before the pilot (Turnstile, plan.md). Until then the 300-an-hour Supabase limit and the per-user rate limits in the database (`rate_limit_hit`) bound abuse.
- **A-6 Staff can read their café's member list** (`members_read` for any role, devices included): names, roles, languages and last-seen times, no contact details and, after L-5, no PIN hash. Needed by the staff screens.
- **A-7 `private.rate_limits` has RLS off.** No API role has any grant on it, and `private` isn't exposed through the Data API.

## Tests

- `npm run check`: lint and typecheck clean; 315 unit tests passed, 2 skipped (3 new for M-1).
- `SQL_TEST_DB=ros_sec bash scripts/test-sql.sh`: 12 suites, 515 checks, all passed (55 in the new `rls_coverage.sql`).
- `npm run build`: passes.
- Playwright against `next start -p 3207` with the new headers, `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`:
  - smoke, auth and QR entry at three widths: 42 passed (one earlier parallel run had two sign-in timeouts on phone and tablet; serial and parallel reruns passed);
  - the full desktop suite: 51 passed, 10 skipped by their migration flags, 2 failed. The passes include the guest menu and ordering and the kitchen board over Realtime (p95 891 ms from order to screen), all with no console errors, so no CSP violation;
  - the 2 failures are `menu.spec.ts`: saving a section returns `PGRST202 Could not find the function api.save_category(...) in the schema cache` from the cloud project. Nothing in this review touches that call or that function. The same spec also failed (at café creation) against another session's server on port 3206 that sends no CSP, so the dev project's API was in flux at the time; reload its schema cache and rerun before Task 11.3. The photo upload in that spec is therefore unverified under the CSP (`img-src` and `connect-src` allow the Supabase project).
- The L-5 column grant can't be checked in the browser until the migration is applied; every `members` read in `src/` names columns from the granted list.

## Owner and next steps

- Apply `20261110100000_security_review` to `restaurant-os-dev` with the other pending migrations (it deletes push subscriptions outside the browsers' push services; there should be none), then regenerate types (no type changes expected) and rerun `tests/integration/rls.test.ts` and the e2e suite.
- Before the pilot: Turnstile (A-5), re-run the dependency checks (A-2).

Skills: none were loaded as tools in this task; the review covered the plan's milestone-11 list (semgrep, security-review, supply-chain-risk-auditor) with the tools named above.
