# Stage 1 build plan

> For agentic workers: execute milestone by milestone with superpowers:executing-plans. Tasks use `- [ ]` checkboxes. Each task is one sitting: write the test, see it fail, make it pass, run the checks, commit.

**Goal:** a working Stage 1 of Pativ on a Vercel preview: QR menu in hy / ru / en, table ordering, kitchen board, waiter app, Telegram alerts, menu from a photo, sales dashboard.

**Architecture:** one Next.js 16 app with route groups for guest, staff, admin and platform (ADR-001). Business rules live in Postgres functions on the Supabase project `restaurant-os-dev`; clients read through RLS and write through `api.*` functions (ADR-004). The app never holds the Supabase secret key (ADR-038). Realtime is database Broadcast used as hints (ADR-010).

**Tech stack:** exact pins from `docs/02-stack/planned-package.json`: Next 16.4.5, React 19.3.1, TypeScript 6.0.3, ESLint 9.39.5, Tailwind 4.3.5, next-intl 4.14.9, @supabase/supabase-js 2.119.0, @supabase/ssr 0.12.7, Zod 4.6.7, TanStack Query 5.107.1, uqr 0.1.3, Recharts 3.10.1, idb 8.0.4, @google/genai 3.0.0, Vitest 5.1.0, Playwright 1.65.0. npm with a committed lockfile.

**Spec:** `docs/brief.md` (Stage 1 and Phase 6), `docs/01-architecture/*`, `docs/02-stack/*`, `docs/03-design/*` with the mockups in `design/`, `docs/04-operations/*`, `docs/05-business/pricing.md` and `metrics.md`.

## Global constraints

- Free plans and services only (ADR-025). `AI_PROVIDER=gemini`; the Claude adapter exists but stays off.
- Vercel preview deploys only. Production only when the owner explicitly says so.
- Never touch the Supabase project "Exishe's Project" (`yvhbmwlbffyuowxjcafy`). Ours is `restaurant-os-dev` (`mhuxfmdehkgpjunxgptc`, `eu-central-1`).
- No code from GPL, AGPL or unlicensed repositories. No secrets in git: `.env.local` locally, `.env.example` committed.
- No Supabase secret key anywhere in the app (ADR-038). Database-side secrets live in Vault.
- Every `SECURITY DEFINER` function: `set search_path = ''`, an explicit caller check, then `revoke execute … from public, anon, authenticated` and named grants.
- UI text only through `messages/{hy,ru,en}.json`. Armenian follows the hy-writer rules (reformed spelling, ։ ՝ ՞ « »), `lang="hy"` on Armenian pages. The brand name comes from the `brand.name` key.
- Money is integer AMD. Prices render as `1 500 ֏` in hy and ru (no-break spaces, U+00A0) and `AMD 1,500` in en. Times are 24-hour.
- Touch targets: 48 × 48 px on guest screens, 56 px on the waiter tablet, 72 px tall buttons on the kitchen board. Kitchen table numbers 64 px, items 26 px.
- WCAG AA contrast. Every screen checked at 390 px (phone), 820 px (tablet) and 1280 px (desktop), with no console errors.
- The guest menu page stays under 100 KB of first-load JavaScript.
- A new order reaches the kitchen screen within 2 seconds for 95 % of orders (`reliability.md`).
- Commits go to the session branch `claude/new-session-qjsyvc`, one per task, pushed at the end of each milestone. No pull requests unless the owner asks.

## Review focus

The five situations most likely to hurt a real café that no feature test covers by default. Each has a test in the task named.

1. A guest's order went through, but the phone lost signal before the answer arrived, so it retries. The retry must show the same order as sent, not an error and not a second order. (Task 5.1)
2. A guest scans a reprinted (old) sticker, or a sticker from another café's table. They get a friendly "ask your waiter" page, never a 500 or another café's menu. (Task 4.2)
3. Long Armenian and Russian dish names (60+ characters) and notes. No overflow at 390 px; a kitchen ticket wraps the name but never hides the quantity. (Tasks 4.3, 6.1)
4. Two staff devices act on the same ticket at once (kitchen marks it ready while a waiter cancels it). One wins, the other refreshes with a clear message, nothing is lost. (Task 6.3)
5. A dish has no translation in the guest's language. The menu falls back visibly to Armenian, then Russian, never to an empty line. (Task 4.3)

## How we work in this cloud session

- Migrations: written in `supabase/migrations/`, applied to `restaurant-os-dev` with the Supabase MCP `apply_migration`. After applying, `list_migrations` gives the version, and the file is named `<version>_<name>.sql`, so the CLI and the project agree later.
- SQL tests run first on the local plain-Postgres harness (`npm run test:sql`), then the same checks run in CI against a local Supabase stack (`supabase test db`).
- Ad-hoc SQL against the cloud project stays read-only; the MCP asks the owner to confirm anything destructive.
- Mechanical work (config files, message files, boilerplate components, test scaffolding) goes to Sonnet subagents with exact briefs; schema, security and state logic stay in the main session.
- After each milestone: `npm run check`, `npm run build`, the milestone's Playwright flows at three widths with the console checked, a commit, a push and a short status note to the owner.

## Owner tasks, and when they're needed

| Needed by | Task | Where | Time |
|---|---|---|---|
| Milestone 2 | Turn on "Allow anonymous sign-ins". Turn off "Confirm email" (the free email service only reaches the project's own team, so café owners would never get the email) | Supabase → Authentication → Sign In / Providers | 2 min |
| Milestone 5 | Raise "Anonymous sign-ins" to 300 an hour (café guests share one Wi-Fi address) | Supabase → Authentication → Rate Limits | 1 min |
| Milestone 8 | Create a bot with @BotFather and paste its token into Vault as `telegram_bot_token` | Telegram, then Supabase → Project Settings → Vault | 5 min |
| Milestone 11 | Create a free Gemini API key in Google AI Studio and add it to the Vercel project as `GEMINI_API_KEY` | aistudio.google.com, vercel.com | 3 min |
| Before the pilot | Cloudflare Turnstile site (free), its secret into Supabase Auth's CAPTCHA setting | dash.cloudflare.com, Supabase → Authentication → Attack Protection | 5 min |

Everything else is done from this session.

Status 10 Nov 2026: the GitHub secret `SUPABASE_ACCESS_TOKEN` is set and CI applied all 17 migrations; the Vercel project `pativ` is linked to the repository.

---

## Milestone 0: project skeleton

### Task 0.1: Next.js app with pinned dependencies and design tokens

**Files:** `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.prettierrc`, `.env.example`, `src/lib/env.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/global-error.tsx`.

**Produces:** `env` (Zod-parsed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_BASE_URL`, `AI_PROVIDER: 'gemini' | 'claude'`, optional `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`); Tailwind theme tokens copied from `design/tokens.css` (matsoni `#FBFCF8`, ink `#13241B`, tarragon `#1D6A43`, apricot `#F2A23A`, pomegranate `#B0213A`, basalt `#0E1612`, line-strong `#7C8B81`).

- [ ] Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e` (`playwright test --trace off`), `test:sql`, `check` (lint + typecheck + test).
- [ ] ESLint: `eslint-config-next`, `no-restricted-imports` per route group as in `repo-structure.md`, `react/jsx-no-literals` on `src/app` and `src/features`.
- [ ] Verify: `npm ci && npm run check && npm run build` pass. Commit.

### Task 0.2: Three languages, fonts and the locale routing

**Files:** `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/proxy.ts`, `messages/hy.json`, `messages/ru.json`, `messages/en.json`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `tests/e2e/smoke.spec.ts`.

**Produces:** locales `['hy', 'ru', 'en']`, default `hy`; locale prefix only on guest pages (`/{locale}/m/...`); staff and admin pages read the locale from the member. Fonts through `next/font/google`: Noto Serif Armenian (width 75, weight 600) and Noto Serif for names and headings, Google Sans 400/600/700 for UI.

- [ ] Test: `/hy` renders `<html lang="hy">` and the `brand.name` text «Պատիվ»; `/ru` and `/en` render their names; an unknown locale returns 404.
- [ ] Verify at 390, 820 and 1280 px with no console errors. Commit.

### Task 0.3: Formatters

**Files:** `src/lib/format/money.ts`, `date.ts`, `search.ts`, with `*.test.ts` beside each.

**Produces:** `formatAmd(amount: number, locale: Locale): string`, `formatTime(d: Date): string`, `formatDate(d: Date, locale: Locale): string`, `normalizeForSearch(s: string): string` (lower case, Armenian and Cyrillic transliterated to Latin, so «խորոված», «хоровац» and "khorovats" give the same key).

- [ ] Tests: `formatAmd(1500, 'hy') === '1 500 ֏'`; `formatAmd(1500, 'ru')` the same; `formatAmd(1500, 'en') === 'AMD 1,500'`; `formatAmd(12450000, 'hy') === '12 450 000 ֏'`; a non-integer or negative amount throws; `formatTime` gives `22:45`; `formatDate` gives `13.11.2026` (hy, ru) and `13 Nov 2026` (en); the three spellings of khorovats normalize to one key that `includes` matches.
- [ ] Commit.

### Task 0.4: Test tooling and CI

**Files:** `vitest.config.ts`, `playwright.config.ts` (projects `phone` 390 × 844, `tablet` 820 × 1180, `desktop` 1280 × 800; launches `PW_CHROMIUM_PATH` when set), `.github/workflows/ci.yml`, `scripts/test-sql.sh` (runs the harness files in `docs/01-architecture/sql/` plus `supabase/tests/sql/*.sql`).

- [ ] CI on every push: `npm ci`, lint, typecheck, unit tests, `npm audit --audit-level=high`, license allowlist (MIT, ISC, BSD-2/3, Apache-2.0, 0BSD, OFL, Unlicense, MPL-2.0 for build tools only).
- [ ] Verify the workflow file with `actionlint` if available, otherwise by reading the first CI run. Commit and push. **Milestone 0 done** when CI is green and the smoke test passes at three widths.

---

## Milestone 1: database on the dev project

### Task 1.1: Baseline schema

**Files:** `supabase/config.toml`, `supabase/migrations/<v>_baseline.sql` (from `docs/01-architecture/sql/10-schema.sql`, without the harness stubs), `src/lib/supabase/types.ts` (generated).

- [ ] Apply with `apply_migration`; name the file from `list_migrations`.
- [ ] Expose the `api` schema to the Data API. Try `alter role authenticator set pgrst.db_schemas = 'public, graphql_public, api'` plus `notify pgrst, 'reload config'`; if the hosted project ignores it, add it to the owner tasks.
- [ ] Verify: `get_advisors` security shows no errors; `curl` to `/rest/v1/rpc/public_menu` with the publishable key and `Content-Profile: api` answers (404 for an unknown café is fine). Commit.

### Task 1.2: ADR-038 functions (no secret key)

**Files:** `supabase/migrations/<v>_adr038_tokens_devices.sql`, `supabase/tests/sql/adr038.sql` (harness test), `docs/01-architecture/sql/00-supabase-stubs.sql` (Vault and pg_net stubs).

**Produces:**
- `private.qr_keys(kid smallint primary key, is_current boolean, created_at, retired_at)`; secret `qr_key_<kid>` created inside the database with `vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), …)`.
- `private.sign_table_token(p_table_id uuid) returns text` and `private.verify_table_token(p_token text) returns table (table_id uuid, qr_version integer)`, in the 34-byte format of ADR-006 (version, kid, table id, qr_version, 96-bit HMAC-SHA256), base64url.
- `api.table_qr_token(p_table_id uuid) returns text`: owner or manager of that location.
- `api.resolve_table_token(p_token text) returns jsonb`: `{restaurant_slug, location_slug, location_id, table_label, guest_locales, default_locale}`, callable by `anon` and `authenticated`; raises `invalid_table_token` (SQLSTATE `P0001`, message key) for a bad signature, a retired key or an old `qr_version`.
- `api.guest_join_table(p_token text, p_locale public.app_locale) returns uuid` (guest session id) and `api.guest_place_order(p_guest_session_id uuid, p_idempotency_key uuid, p_lines jsonb, p_note text) returns uuid`: `authenticated`; they call `private.join_table` and `private.place_guest_order` for `auth.uid()`.
- `api.create_device_pairing(p_location_id uuid, p_role public.member_role, p_label text) returns text` (6-digit code, stored hashed, 10 minutes), `api.redeem_device_pairing(p_code text) returns jsonb` (`{member_id, role, location_id, station_id}`), `api.revoke_member(p_member_id uuid) returns void` (sets inactive, deletes the user's refresh tokens).
- `api.create_invitation(p_role public.member_role, p_location_id uuid) returns text`, `api.accept_invitation(p_code text) returns uuid`.
- `private.is_real_user()` changed: true for a signed-in non-anonymous user, or an anonymous user who is an active device member.

- [ ] Harness tests: a valid token joins; one flipped byte, a retired key, an old `qr_version` and another café's table id are each refused; a guest calling `api.accept_order` is refused; a redeemed device sees its location's tickets and nothing of café B; a used code fails; the sixth wrong code in 10 minutes is rate-limited; after `api.revoke_member` the device reads nothing.
- [ ] Apply to the cloud project, re-run advisors, regenerate types. Commit.

### Task 1.3: Columns from ADR-033, ADR-036 and ADR-037

**Files:** `supabase/migrations/<v>_ops_plans_metrics.sql`, `supabase/tests/sql/ops_plans_metrics.sql`.

**Produces:** `locations.kitchen_busy_until timestamptz`, `locations.expected_wait_minutes smallint check (in 20, 30, 45)`; `members.last_seen_at`; `orders.is_test boolean default false`, `orders.possible_duplicate_of uuid`; `subscriptions.plan in ('menu', 'service')` (seed's `standard` renamed), `canceled_at`, `cancel_reason`, `converted_at`; `kitchen_tickets.first_seen_at`; `api.mark_tickets_seen(p_ticket_ids uuid[]) returns void` (sets only when null); `api.heartbeat() returns void` (device members only); `private.location_can_order(p_location_id uuid) returns boolean` (plan `service` and not `past_due` for more than 7 days), checked by guest and waiter ordering.

- [ ] Tests: ordering on a `menu`-plan location is refused with `plan_required`; `mark_tickets_seen` keeps the first timestamp; `heartbeat` from a guest is refused. Commit.

### Task 1.4: Demo café seed

**Files:** `supabase/seed.sql`.

**Produces:** «Դեմո սրճարան» / "Demo Café" (`demo-cafe`, location `main`), 12 tables in two areas, kitchen and bar stations, about 40 items in hy, ru and en from `dev-workflow.md` with sizes and options, a published menu, a dev owner `owner@demo.pativ.test` whose password is generated at seed time and printed once to the session (never committed).

- [ ] Verify: `api.public_menu('demo-cafe', 'main')` returns 40 items in three languages; the harness smoke test still prints `ALL SMOKE TESTS PASSED`. Commit and push. **Milestone 1 done.**

---

## Milestone 2: sign-in, cafés, staff and devices

Needs the owner's first Supabase task (anonymous sign-ins on, email confirmation off).

### Task 2.1: Supabase clients and session refresh

**Files:** `src/lib/supabase/server.ts` (`createClient(): Promise<SupabaseClient<Database>>` with Next cookies), `src/lib/supabase/browser.ts` (`getBrowserClient()` singleton), `src/proxy.ts` (refresh the session on staff and admin paths), `src/lib/auth/require-member.ts` (`requireMember(roles: MemberRole[]): Promise<Member>`; redirects to `/login`).

- [ ] Test: an unauthenticated request to `/admin` redirects to `/login`; a waiter device opening `/admin` gets 403. Commit.

### Task 2.2: Owner sign-up, sign-in and "create your café"

**Files:** `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/features/onboarding/actions.ts` (`createCafe(input: {name, slug, locationName, displayName})` → `api.create_restaurant`), `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/page.tsx`.

- [ ] E2E (390 and 1280): sign up, create «Թեստ սրճարան», land on the admin home in Armenian; a taken slug shows the message in the user's language. Commit.

### Task 2.3: Staff and devices

**Files:** `src/app/(admin)/admin/staff/page.tsx`, `src/features/staff/actions.ts`, `src/app/(auth)/pair/page.tsx`, `src/app/(auth)/invite/[code]/page.tsx`.

- [ ] E2E with two browser contexts: the owner creates a kitchen pairing code; the device enters it at `/pair` and lands on `/kitchen/<station>`; the owner revokes it and the device shows "this device was disconnected" within one refresh.
- [ ] Integration test (`tests/integration/rls.test.ts`, Vitest against the dev project): owner A reads none of café B's menus, tables or orders; a guest session can't read staff tables. Commit and push. **Milestone 2 done.**

---

## Milestone 3: menu editor

### Task 3.1: Categories, dishes, translations, sizes and options

**Files:** `src/app/(admin)/admin/menu/**`, `src/features/menu/schema.ts` (Zod: name hy required, ru and en optional, price integer 0–10,000,000), `src/features/menu/actions.ts`.

- [ ] Unit tests for the schema (a price of `1500.5` and an empty Armenian name are rejected). E2E: add a category and a dish with three names, a size group and an option; reorder by drag or arrows. Commit.

### Task 3.2: Dish photos and the stop list

**Files:** `src/features/menu/photo.ts` (`resizeToWebp(file: File, maxPx = 600): Promise<Blob>`), storage bucket `menu-images` (public, path starts with `restaurant_id`, 2 MB, JPEG/PNG/WebP), `src/features/menu/stop-list.tsx`.

- [ ] E2E: upload a 3 MB JPEG; the stored file is WebP under 200 KB; mark the dish «Այսօր չկա» and see it greyed out in `api.public_menu`. Commit.

### Task 3.3: Publish

**Files:** `src/features/menu/publish.ts`, `src/app/(admin)/admin/menu/publish/page.tsx`.

- [ ] E2E: publish works; a dish with an unreviewed AI translation blocks publishing and names the dish. Commit and push. **Milestone 3 done.**

---

## Milestone 4: guest QR menu

### Task 4.1: Tables and QR cards

**Files:** `src/app/(admin)/admin/tables/**`, `src/features/tables-qr/qr-svg.ts` (`qrSvg(url: string, opts): string` with uqr), `src/features/tables-qr/print-sheet.tsx` (A4, 4 cards a sheet).

- [ ] E2E: add 12 tables; the print view shows 3 sheets; "Reprint QR" on table 5 changes its token. Commit.

### Task 4.2: The QR entry

**Files:** `src/app/t/[token]/route.ts`, `src/lib/security/table-token.ts` (`isWellFormedToken(t: string): boolean`: 46 base64url characters), `src/app/[locale]/(guest)/table-error/page.tsx`.

- [ ] Tests: a malformed token never calls the database (unit); a good token redirects to `/{locale}/m/demo-cafe/main?t=…` with the locale from `Accept-Language` among the café's languages; an old sticker, a tampered token and another café's token all show the "ask your waiter" page with status 404, in three languages (Review focus 2). Commit.

### Task 4.3: Menu, dish sheet and cart

**Files:** `src/app/[locale]/(guest)/m/[restaurant]/[location]/page.tsx` (server component from `api.public_menu`), `src/features/ordering/cart-store.ts` (`useCart(locationId)`; localStorage per location), `src/features/menu/guest-menu/*.tsx` (category tabs, search, dish card, dish sheet with modifier rules, sold-out state, "kitchen busy" banner).

- [ ] Tests: search matches "khorovats", «хоровац» and «խորոված»; a dish without an English name shows the Armenian name with `lang="hy"` (Review focus 5); a 70-character Russian name wraps without horizontal scroll at 390 px (Review focus 3); totals use `formatAmd`; `next build` reports under 100 KB first-load JS for this route. Commit and push. **Milestone 4 done.**

---

## Milestone 5: ordering and live status

### Task 5.1: Placing an order

**Files:** `src/features/ordering/place-order.ts` (`placeOrder(cart, tableToken): Promise<{orderId}>`: anonymous sign-in on first use, `api.guest_join_table`, `api.guest_place_order` with an idempotency key saved before the request and reused on retry), migration for the possible-duplicate rule (same dishes, same table, different guest session, within 3 minutes → waits for the waiter, `possible_duplicate_of` set).

- [ ] Tests: Playwright cuts the network after the request is sent, then restores it; the retry shows the same order and the database holds one (Review focus 1). A second browser ordering the same two tolmas within 3 minutes gets "the waiter will confirm". Commit.

### Task 5.2: Status page, calling the waiter, asking for the bill

**Files:** `src/app/[locale]/(guest)/m/[restaurant]/[location]/order/page.tsx`, `src/lib/realtime/use-guest-channel.ts` (subscribes to `guest:<id>`, falls back to polling every 10 s), `api.guest_service_request(p_guest_session_id uuid, p_kind public.service_request_kind) returns uuid`.

- [ ] E2E: after a staff action (SQL call in the test), the status changes without reload within 2 s; a second "call waiter" tap doesn't create a second request. Commit and push. **Milestone 5 done.**

---

## Milestone 6: kitchen board

### Task 6.1: Board layout and timers

**Files:** `src/app/(staff)/kitchen/[stationId]/page.tsx`, `src/features/kitchen/ticket-card.tsx` (`TicketCard.Root/Lines/Actions`, `VoidTicketCard`), `src/features/kitchen/use-server-clock.ts`.

- [ ] Tests at 1280 × 800: columns New, Cooking, Ready; table number 64 px; a ticket turns apricot at 8 minutes and red at 12; a long name wraps and the quantity stays visible (Review focus 3). Commit.

### Task 6.2: Live updates, sound, wake lock, first-seen

**Files:** `src/lib/realtime/use-location-channel.ts`, `src/features/kitchen/start-shift.tsx` (unlocks audio, requests wake lock), calls to `api.mark_tickets_seen` and `api.heartbeat`.

- [ ] E2E with two contexts: a guest order appears on the board; the test records order → board time and asserts under 2 s on 20 orders at p95. Commit.

### Task 6.3: Actions and the offline outbox

**Files:** `src/lib/offline/outbox.ts` (`enqueue(action)`, `replay()`, IndexedDB via idb), `src/lib/offline/outbox-provider.tsx`, `src/features/kitchen/actions.ts` (`api.set_ticket_status` with `expected`).

- [ ] Tests: offline "ready" queues and replays once when online; the red «Կապ չկա» label appears after 15 s; when two devices change the same ticket, the loser shows «Արդեն փոխվել է» and refreshes (Review focus 4). Kitchen busy switch sets the expected wait shown to guests. Commit and push. **Milestone 6 done.**

---

## Milestone 7: waiter app

### Task 7.1: Floor map and requests

**Files:** `src/app/(staff)/waiter/page.tsx`, `src/features/waiter/floor-map.tsx`.

- [ ] E2E at 820 px: table states (free, seated, ordered, ready, calling, bill) follow real orders; a call turns the table red and one tap resolves it. Commit.

### Task 7.2: Table detail, accepting orders, the order pad

**Files:** `src/features/waiter/table-panel.tsx`, `src/features/waiter/order-pad.tsx` (`api.place_waiter_order` through the outbox), `src/features/waiter/actions.ts` (accept, reject, served, cancel line).

- [ ] E2E: a large QR order waits for acceptance and reaches the kitchen after "Accept"; cancelling a served line asks for a manager. Commit.

### Task 7.3: Closing the table

**Files:** `src/features/waiter/settle.tsx` (`api.settle_table_session`, online only), migration for the stale-table guard in `private.join_table`.

- [ ] E2E full loop: guest orders → accepted → kitchen ready → served → settled by card → table free → the old guest session can't order. A new guest at a table that looks finished makes the waiter close the old bill first. Commit and push. **Milestone 7 done.**

---

## Milestone 8: Telegram alerts

### Task 8.1: Linking the owner's Telegram

**Files:** `src/app/(admin)/admin/telegram/page.tsx`, `src/app/api/telegram/route.ts` (passes the body and the `X-Telegram-Bot-Api-Secret-Token` header to `api.telegram_update(p_secret text, p_update jsonb)`), migration with `api.telegram_update` and `private.telegram_set_webhook()`.

- [ ] Harness test: a wrong secret is refused; `/start <code>` links the chat and marks the code used. Commit.

### Task 8.2: Delivery from the database

**Files:** migration with `private.render_notification(p_kind text, p_payload jsonb, p_locale app_locale) returns text`, `private.deliver_outbox()` (pg_net to `api.telegram.org`, token from Vault), `private.collect_outbox_responses()`, pg_cron schedules; alerts for new orders, tickets over 20 minutes, a station offline for 2 minutes in opening hours, and the day summary.

- [ ] Harness tests (pg_net stubbed): a new order produces the Armenian text «Նոր պատվեր՝ սեղան 5, 6 500 ֏»; a failed send retries at 1, 5 and 15 minutes and is dead after 5 failures; no token in Vault means nothing is sent and nothing fails. Live test once the owner has added the bot token. Commit.

### Task 8.3: Web push for owners without Telegram (ADR-035)

**Files:** `src/features/notifications/push-subscribe.tsx`, `src/app/api/push/route.ts` (sends pending `web_push` outbox rows; called by pg_net with a per-row signed id), `public/sw.js` push handler, migration adding the `web_push` channel and `push_subscriptions`.

- [ ] Tests: subscribing stores one row per device; a new order creates a `web_push` outbox row with the same text as Telegram; the route refuses an unsigned call. The VAPID key pair is generated at deploy time straight into Vercel env, never printed. Commit and push. **Milestone 8 done.**

---

## Milestone 9: menu from a photo

### Task 9.1: Reader interface and Gemini adapter

**Files:** `src/features/menu-import/reader.ts` (`interface MenuReader { read(images: ImageInput[], hints: {languages: Locale[]}): Promise<MenuDraft> }`), `schema.ts` (Zod `MenuDraft`: categories, items with names per language, `price_amd: number | null`, `confidence: number`, modifiers), `gemini.server.ts`, `claude.server.ts` (off), `fake.ts` (fixtures for tests), `parse-price.ts` (`parsePrice(raw: string): number | null`).

- [ ] Tests: `parsePrice('1500') === 1500`, `'1.500' → 1500`, `'1 500 դր.' → 1500`, `'1500-2000' → null`; the Zod schema rejects a draft without categories; a live run on two public menu photos in `tests/fixtures/menus/` returns a valid draft. Commit.

### Task 9.2: Upload, review and apply

**Files:** `src/app/(admin)/admin/menu/import/**` (the `design/import.html` flow), `src/features/menu-import/actions.ts`, migration with `api.save_menu_import_draft(p_import_id uuid, p_draft jsonb)` and `api.apply_menu_import(p_import_id uuid)` (rows get `source = 'ai'`, unreviewed).

- [ ] E2E with the fake reader: upload two photos, fix a low-confidence price, mark all reviewed, apply, publish. Without review, publish is refused. Commit and push. **Milestone 9 done.**

---

## Milestone 10: sales dashboard, plans and export

### Task 10.1: Daily metrics and the dashboard

**Files:** migration with `public.metrics_daily` and `private.compute_metrics_daily(p_date date)` (pg_cron at 05:30 Yerevan), `src/app/(admin)/admin/dashboard/page.tsx` (Recharts, loaded only on this route).

- [ ] Tests: with seeded orders the queries in `metrics.md` return the expected numbers; the page shows today's orders, revenue, average bill, top dishes, kitchen time and QR share. Commit.

### Task 10.2: Plans, free month and CSV export

**Files:** `src/features/billing/plan-banner.tsx`, `src/app/(admin)/admin/export/route.ts` (CSV of menu, orders, bills for the caller's café).

- [ ] Tests: on the `menu` plan the guest menu works and the cart says ordering is off; the export contains only the caller's café. Commit.

### Task 10.3: Platform admin

**Files:** `src/app/(platform)/platform/**`.

- [ ] E2E: a platform admin lists cafés, changes a plan and sees dead-letter messages. Commit and push. **Milestone 10 done.**

---

## Milestone 11: polish, security review and preview deploy

### Task 11.1: PWA, accessibility, language overflow

**Files:** `src/app/manifest.ts`, `public/sw.js`, `tests/e2e/a11y.spec.ts`, `tests/e2e/overflow.spec.ts`.

- [ ] axe finds no serious or critical issues on any screen; every screen at three widths with the longest strings has no horizontal scroll; the staff app installs and opens offline to its last screen. Commit.

### Task 11.2: Security and dependency review

- [ ] Semgrep on the whole app; the RLS suite covers every table for every role; secret scan of the history; `npm audit`; license check; supply-chain review of anything added since Phase 2. Fix or record each finding. Commit.

### Task 11.3: Vercel preview

- [ ] Vercel Hobby project from the repository, env vars from `.env.example`, deployment protection on, preview of the session branch only. Run the core Playwright flows against the preview URL. Send the owner the link and the status. **Milestone 11 done; Stage 1 ready for the pilot.**

---

## Skills by milestone

| Milestone | Skills |
|---|---|
| 0 | vercel-react-best-practices, tdd, verification-before-completion |
| 1, 2, 5, 7, 8 | supabase, supabase-postgres-best-practices, tdd, sharp-edges |
| 3, 4, 6, 7, 9 | frontend-design, web-design-guidelines, det-ai, vercel-composition-patterns, hy-writer, webapp-testing, playwright-cli |
| 10 | dataviz, data:sql-queries |
| 11 | design:accessibility-review, semgrep, supply-chain-risk-auditor, differential-review, security-review, deploy-to-vercel |
