# Architecture decisions

ADR-style records, short on purpose. All are Proposed until Gate 1. Each one names the alternatives we rejected and why, so a later reader can tell whether the reason still holds. New decisions get appended. A changed decision gets a new record that supersedes the old one; old records are never edited.

---

### ADR-001: One Next.js app and one Supabase project

- Status: Proposed, 2026-11-09
- Decision: A single Next.js (App Router) app with route groups for guest, staff, admin and platform, deployed on Vercel, on top of one Supabase project. No separate API service, no queue product, no microservices.
- Rejected: separate apps per surface (four deploys and duplicated auth for one small team); a NestJS API like nodedr (a second runtime to host and secure, when Postgres functions plus server actions cover it); a self-hosted LAN server like FloCafe (needs hardware and IT in every café).
- Consequences: One codebase, one deploy, shared types. Route-group boundaries must be respected, so the guest bundle never imports admin code (checked in Phase 2 with bundle analysis).

### ADR-002: Shared schema, `restaurant_id` on every row, RLS plus composite tenant keys

- Status: Proposed
- Decision: All tenants share tables. Isolation is enforced by RLS on every table and by composite foreign keys `(restaurant_id, parent_id)`.
- Rejected: a schema per tenant (migrations × tenants, and connection pooling gets awkward); a database per tenant (cost and operations far beyond 10,000–20,000 AMD per month per café); application-level filtering only (nodedr's approach; one missed `where` leaks a café).
- Consequences: One migration path. Every new table needs `restaurant_id`, RLS and policies. CI checks that RLS is on and runs the cross-tenant tests.

### ADR-003: Restaurant is the tenant, location is the billing unit

- Status: Proposed
- Decision: `restaurants` own menus, staff and branding. `locations` own tables, stations, counters, the published menu and the subscription.
- Rejected: location as tenant (chains would duplicate menus and staff); restaurant-level billing (the business model is per location).
- Consequences: Menus are shared and assigned to locations (`menu_locations`). Prep areas are per restaurant; stations are per location.

### ADR-004: Clients read through RLS, state changes go through Postgres functions

- Status: Proposed
- Decision: Browsers query tables directly for reads. Plain forms (menu, floor, settings) write directly under RLS. Orders, tickets, sessions, bills and payments change only through `api.*` functions, which assert the caller's role at that location (guest functions included since ADR-038). Clients have no `INSERT/UPDATE/DELETE` grants on those tables.
- Rejected: all writes through Next.js server actions with the service role (RLS stops protecting writes, and one bug becomes a cross-tenant write); all writes as plain table updates under RLS (pricing, fan-out and transitions can't be expressed in policies).
- Consequences: The rules are tested in SQL (`90-smoke-test.sql`, then pgTAP or Vitest in CI). `SECURITY DEFINER` functions follow strict rules: `search_path = ''`, an explicit role assert, an explicit `revoke … from public, anon, authenticated`.

### ADR-005: Guests are Supabase anonymous users; guest writes go through our server

- Status: Accepted for anonymous guests; the server-and-service-role part is superseded by ADR-038
- Decision: The guest's first action (order, call waiter) silently creates a Supabase anonymous session behind invisible Turnstile. Reads (their orders, their Realtime channel) use that JWT under RLS. Writes go through a server action that verifies the table QR and the JWT, then calls `private.join_table` and `private.place_guest_order` with the service role.
- Rejected: no auth at all, with order status by unguessable URL and public channels (no RLS, and Realtime would need "public access" switched on project-wide); custom JWTs signed by us (fights Supabase's key management); guest sign-up (kills ordering).
- Consequences: The anonymous sign-in limit must be raised from 30 to about 300 per hour per IP, because café guests share one IP. Anonymous users need a cleanup job. Stage 3 and 4 can upgrade a guest to a real customer with identity linking and keep their history.

### ADR-006: Table QR is an HMAC-signed static token with key id and per-table version

- Status: Proposed
- Decision: `/t/<token>`; the token holds a format byte, key id, table id, `qr_version` and a 96-bit HMAC-SHA256 tag. Verified on the server before any database work. Reprinting one table bumps `qr_version`; rotating the key uses `kid`.
- Rejected: a random token stored hashed (equally safe, but every garbage request costs a database lookup, and the brief asked for signed tokens); codes that rotate daily (needs a screen or reprinting every day); NFC tags (hardware cost).
- Consequences: A photographed sticker still works off-site. Damage is limited by waiter acceptance above a threshold, table-empty flags and reprinting (`multi-tenancy-and-security.md`).

### ADR-007: Three state machines, one derived guest status

- Status: Proposed
- Decision: `orders.status` (placed, accepted, rejected, cancelled), `kitchen_tickets.status` per station (new, cooking, ready, served, cancelled) and the bill/payment state are separate. `orders.kitchen_status` (slowest live ticket) is kept by a trigger. The guest-facing status comes from `order_display_status()`: received → accepted → cooking → ready → served → paid.
- Rejected: one big status column (it can't express "paid but still cooking" or "bar ready, kitchen cooking", and nodedr and FloCafe both split it for this reason); fully configurable statuses like TastyIgniter (the kitchen screen and analytics can't reason about them).
- Consequences: Transitions are compare-and-set functions with role checks. Every change is logged to `order_status_history`.

### ADR-008: An order is an immutable round inside a table session

- Status: Proposed
- Decision: A `table_session` is the open check (one per table at a time). Each submission by a guest or waiter is a new `order` in it. Orders aren't edited after placement; lines can only be cancelled.
- Rejected: one mutable order per table that grows (edits conflict between a guest phone, the waiter tablet and an offline outbox; tickets would need diffs, which is URY's fragile part).
- Consequences: Offline replay is safe. Bills cover a session. Stage 2 split bills split session lines across several bills.

### ADR-009: Station routing through prep areas; kitchen tickets never change

- Status: Proposed
- Decision: Items or categories declare a prep area (Kitchen, Bar). Each location maps prep areas to its stations, with a default station as fallback. An order fans out into one ticket per station. A cancellation after cooking starts creates a `void` ticket that the kitchen must acknowledge.
- Rejected: routing by item group only, as in URY (no per-item override); a `station_id` on items (breaks for chains whose locations have different screens); editing tickets in place (cooks miss changes).
- Consequences: Setup needs a prep-area-to-station screen. A one-screen café maps everything to the default station, so it's zero effort.

### ADR-010: Realtime is Broadcast from the database to private channels, used as hints

- Status: Proposed
- Decision: Triggers call `realtime.send()` to `loc:<location>` and `guest:<guest_session>`. Access is controlled by RLS on `realtime.messages`, and clients can't send. Clients refetch on every message, on every reconnect and on a 10–15 s safety poll.
- Rejected: Postgres Changes (Supabase recommends Broadcast for scale and security, and Postgres Changes checks RLS per subscriber per change); Socket.IO on our own server (another service to run); polling only (misses the 2-second target).
- Consequences: Payloads stay tiny. Correctness never depends on receiving every message.

### ADR-011: Server-authoritative offline handling with a staff outbox

- Status: Proposed
- Decision: Waiter and kitchen PWAs queue safe actions (orders with idempotency keys, compare-and-set status changes) in IndexedDB and replay them in order. A stale conflict drops the action and refetches. Money, publishing and post-service cancellations are never queued. Guests retry with an idempotency key.
- Rejected: a local-first sync engine (PowerSync, ElectricSQL, RxDB): a big dependency and real conflict resolution for a problem that short, safe queues solve; no offline support (cafés would lose orders in every drop).
- Consequences: Every queued action has to be idempotent in the database; the smoke test covers it. The UI must show pending actions honestly.

### ADR-012: Money is integer AMD

- Status: Proposed
- Decision: Every price and total is an `integer` count of whole drams. The single currency is `AMD`, enforced by a check constraint. The conversion to the decimal format a payment provider wants (Ameria: `25000.00`) happens at the provider boundary only. Stage 4 ingredient costs are `numeric`.
- Rejected: floats (eatlah); text (menufic); minor units (luma aren't used in practice, so `150000` for 1,500 AMD invites bugs).
- Consequences: No rounding inside the app. Adding a currency with real minor units later would need a migration.

### ADR-013: Translations as rows; published menus and order lines as snapshots

- Status: Proposed
- Decision: Five `*_translations` tables with `source` and `reviewed_at` per row. Publishing builds an immutable `menu_versions.snapshot` per location. Order lines copy `name_i18n` in all three languages.
- Rejected: `name_en`-style column pairs (eatlah; doesn't scale to three languages and has nowhere to store review state); a JSONB `{hy, ru, en}` column per entity (simpler queries, but no per-language review metadata); one generic polymorphic translation table (no foreign keys).
- Consequences: The editor joins translation tables. Guests and waiters read one JSON document, which is fast and cacheable. The kitchen reads its own language from order lines.

### ADR-014: Unreviewed AI output can't be published, enforced in the database

- Status: Proposed
- Decision: Rows written from AI output are `source = 'ai'`. `api.publish_menu` raises `unreviewed_ai_translations` while any of them at that location lacks `reviewed_at`.
- Rejected: a check in the UI only (bypassable, and easy to break in a refactor).
- Consequences: The review screen has to make reviewing fast: approve per item, per category, or "all looks right" after scrolling through.

### ADR-015: Our own formatters for numbers and dates

- Status: Proposed
- Decision: A small shared module formats AMD, numbers, dates and times for hy, ru and en. Plurals use `Intl.PluralRules` through next-intl.
- Rejected: relying on `Intl` (Chromium has no Armenian number, date or list data and silently prints English; checked on 9 Nov 2026).
- Consequences: About a hundred lines of code with unit tests. One consistent price format everywhere (`1 500 ֏`).

### ADR-016: Telegram and other side effects go through an outbox

- Status: Proposed
- Decision: The order transaction inserts into `notification_outbox`. Delivery happens through `pg_net` → `/api/jobs/notify`, with a `pg_cron` retry sweep every minute and dead-lettering after 8 attempts.
- Rejected: calling Telegram inside the server action (a slow or failed Telegram call would block or lose orders); a queue service (another vendor for a few messages per minute).
- Consequences: Alerts arrive seconds after the order, not milliseconds. Failures are visible and retried.

### ADR-017: Stage 1 staff devices pair with a code; personal staff logins come in Stage 2

- Status: Proposed
- Decision: Kitchen screens and shared waiter tablets are paired with a 10-minute, single-use code and become `kind = 'device'` members. Owners and managers have personal email logins.
- Rejected: personal accounts for every waiter in Stage 1 (email or SMS for every waiter slows onboarding below the 30-minute target); one shared password per café (no revocation, no audit).
- Consequences: Stage 1 can't attribute sales to individual waiters. Stage 2 adds PINs on shared devices (`members.pin_hash`) for per-waiter stats.

### ADR-018: Sizes and options are modifier groups

- Status: Proposed
- Decision: Reusable `modifier_groups` with `min_select` and `max_select`. A size is a required group with min = max = 1.
- Rejected: a separate variants table (two concepts for the same UI; nodedr lacks variants and is fine).
- Consequences: One pricing path in `place_order_core`. Group rules are validated on the server; the smoke test covers it.

### ADR-019: Frankfurt for the database and the server

- Status: Proposed
- Decision: Supabase `eu-central-1` and Vercel functions in `fra1`.
- Rejected: split regions (every server action would pay a database round trip across regions); regions further from Yerevan.
- Consequences: Yerevan-to-Frankfurt latency has to be measured from a real café in Phase 4 to confirm the 2-second kitchen target.

### ADR-020: Rate limits in Postgres and at the edge, no Redis

- Status: Proposed
- Decision: Per-guest, per-table and per-order limits live in an unlogged Postgres counter table. Per-IP limits use the Vercel Firewall, plus Turnstile before anonymous sign-in.
- Rejected: Upstash or other Redis (another vendor and secret before we have traffic that needs it).
- Consequences: Revisit if `private.rate_limits` shows up in slow-query logs.

### ADR-021: Stage 3 payments use the hosted page, server-side verification and per-location credentials in Vault

- Status: Proposed
- Decision: For Ameriabank vPOS (or ArCa EPG): the server calls InitPayment, the guest goes to the bank's hosted page, and the server checks the result with GetPaymentDetails. We never trust the redirect. A reconciliation job covers guests who never come back. Each location's credentials sit in Supabase Vault. Every attempt has a new integer OrderID (`payment_attempts`).
- Rejected: trusting BackURL parameters (Ameria signs nothing and has no webhook); storing credentials in tables or env vars per tenant.
- Consequences: Each café probably needs its own merchant contract. A platform or sub-merchant deal with one bank would simplify onboarding. Phase 5 left this for Stage 3: Stage 1 takes no guest payments, and cafés pay us by invoice (`docs/05-business/pricing.md`).

### ADR-022: Fiscal receipts (HDM) are out of scope until we have tax advice

- Status: Proposed
- Decision: Stage 1 prints nothing and handles no money beyond recording how a table paid. The café keeps its existing HDM. Before Stage 2 printing, an Armenian tax adviser answers what a POS that prints bills must do.
- Rejected: designing an HDM integration now (rules unknown; risk of building the wrong thing).
- Consequences: Stage 2 has a hard dependency on that answer. Our printed bills must never look like fiscal receipts.

### ADR-023: UUID v4 keys and Postgres enums for states

- Status: Proposed
- Decision: `uuid` primary keys (`gen_random_uuid()`, clients can generate them too). `enum` types for statuses and roles. People see numbers only where they need them: per-day order and bill numbers.
- Rejected: bigint identities (clients can't create ids offline, and they leak volume); text with check constraints for states (no generated TypeScript union types).
- Consequences: Enum values can be added but not removed, so new states need care. Fine for state machines that rarely change.

### ADR-024: Guests use Realtime until about 15 cafés, then we revisit

- Status: Proposed
- Decision: Guests subscribe to `guest:<session>` while an order is open. At about 15 live cafés we either lift the Pro plan's 500-connection cap (spend cap off, 10,000) or switch guests to 10-second polling.
- Rejected: deciding now without real connection numbers.
- Consequences: `costs.md` (Phase 4) prices both paths. The guest client hides the transport behind one hook, so switching is a small change.

---

## Phase 2 decisions

### ADR-025: Free plans only until the owner says otherwise

- Status: Accepted (owner instruction), 2026-11-09
- Decision: Use only free plans and services. AI runs on the Gemini free tier, the database on Supabase Free, hosting on Vercel Hobby, monitoring on free tiers. Anything that needs money stops and goes to the owner.
- Consequences:
  - Vercel Hobby allows only personal or non-commercial use. It's fine for building and a free pilot, but paid hosting is needed before the first café pays.
  - Supabase Free has no backups, so a nightly encrypted `pg_dump` runs in GitHub Actions. Projects pause after a week without activity, and 200 Realtime connections cap the pilot at roughly 8 busy cafés.
  - Gemini's free tier may use prompts to improve Google's products. Menu photos are public information; owners are told at import.
  - Vercel Hobby allows one firewall rate-limit rule. It goes on `/t/*`; everything else relies on the Postgres limits.
  - Upgrade order when lifted: Supabase Pro → paid hosting → Claude → email domain.

### ADR-026: The AI menu reader sits behind our own interface, on official SDKs

- Status: Proposed
- Decision: A `MenuReader` interface (`readMenu`, `translate`) with a Gemini adapter (`@google/genai`) and a Claude adapter (`@anthropic-ai/sdk`). Both return data validated by one Zod schema. `AI_PROVIDER` picks the adapter.
- Rejected: Claude only (not free); the Vercel AI SDK (`ai` 7) as a provider abstraction (more surface than two calls need, and it hides provider-specific structured-output features).
- Consequences: The Phase 6 test set (15–20 real menus) runs against Gemini now and against Claude once allowed, so the switch is measured, not assumed.

### ADR-027: `uqr` plus our own SVG for table QR codes

- Status: Proposed
- Decision: Generate the QR matrix with `uqr` 0.1.3 (no dependencies) and render the branded SVG and A4 print sheets ourselves, using print CSS.
- Rejected: `qr-code-styling` 1.9.2 (last release April 2025, browser-canvas oriented); a PDF library (the browser prints A4 well).
- Consequences: We own about 100 lines of SVG drawing. QR codes must use high error correction when a logo covers the centre; tested by scanning printed sheets with real phones in Phase 6.

### ADR-028: Charts with Recharts through shadcn, not Tremor

- Status: Proposed
- Decision: `recharts` 3.10.1 via shadcn's chart component, styled with our tokens.
- Rejected: `@tremor/react` (last published January 2025; its successor is copy-paste code on Recharts anyway).

### ADR-029: A hand-written service worker, no PWA library

- Status: Proposed
- Decision: `public/sw.js` with cache-first for hashed `/_next/static` files, network-first for staff pages with an offline fallback, plus `idb` for the outbox. The manifest comes from `app/manifest.ts`.
- Rejected: `@serwist/next` (adds `@serwist/cli`; precaching every route isn't needed).
- Consequences: Service-worker updates are versioned by hand; Playwright tests the offline path.

### ADR-030: Restaurant OS gets its own Supabase project; the existing one is off limits

- Status: Proposed
- Decision: Create `restaurant-os-dev` (free, `eu-central-1`) in Phase 6 after the owner confirms. Production gets its own project when the free rule allows. The account's existing project "Exishe's Project" is never used.
- Rejected: reusing the existing project (it holds another product's tables, and our migrations revoke default grants across `public`, which would break that product).
- Consequences: It uses the second of the two free project slots.

### ADR-031: TypeScript 6 and ESLint 9 until the ecosystem catches up

- Status: Proposed
- Decision: Pin `typescript` 6.0.3 and `eslint` 9.39.5.
- Rejected: TypeScript 7.0.2 (outside `typescript-eslint`'s supported range `<6.1.0`); ESLint 10 (three plugins inside `eslint-config-next` 16.4.5 accept ESLint up to 9).
- Consequences: Revisit when `typescript-eslint` and `eslint-config-next` release support. Dependabot will flag the upgrades.

### ADR-032: npm and exact version pins

- Status: Proposed
- Decision: npm with a committed `package-lock.json` and exact versions in `package.json`. Upgrades arrive as pull requests that must pass CI and the license allowlist.
- Rejected: pnpm (fine, but the supply-chain auditor we use doesn't read its lockfile).

---

## Phase 4 decisions

### ADR-033: Operational safeguards found by walking through a Friday evening

- Status: Proposed, 2026-11-09
- Decision: Add to Stage 1:
  1. Possible duplicates: a QR order with the same dishes as another order from the same table within 3 minutes, from a different guest session, waits for the waiter instead of going straight to the kitchen.
  2. "Kitchen busy": a switch with an expected wait (20/30/45 min) shown to guests, which turns off by itself after an hour.
  3. Device heartbeat: an alert to the owner when a kitchen or bar screen is offline for 2 minutes during opening hours.
  4. Stale-table guard: a new guest joining a table whose orders are all served and whose bill was requested (or idle for 45 minutes) makes the waiter close the old bill first.
  5. Test orders: an `is_test` flag that keeps onboarding and training orders out of sales reports.
- Rejected: blocking all second orders from a table (punishes real second rounds); estimating wait times automatically (not enough data in Stage 1; the cook knows better).
- Consequences: Schema additions in the Stage 1 migrations are:
  - `locations.kitchen_busy_until` and `locations.expected_wait_minutes`;
  - `members.last_seen_at`;
  - `orders.is_test`;
  - a `possible_duplicate_of` reference on orders.
  `day-in-the-life.md` has the scenarios behind each one.

### ADR-034: Frankfurt confirmed by measurement

- Status: Accepted, 2026-11-09
- Context: ADR-019 chose Frankfurt before latency from Armenia was measured.
- Evidence: Globalping probes on five Armenian networks, TCP connect to AWS S3 endpoints: median 59 ms to Frankfurt (`eu-central-1`), 82 ms to Dublin (`eu-west-1`). Details in `docs/04-operations/costs.md`.
- Decision: Keep Supabase in `eu-central-1` and Vercel functions in `fra1`. The new `restaurant-os-dev` project is created there too.

---

## Phase 5 decisions

### ADR-035: Owner alerts go to Telegram, with web push as the fallback

- Status: Accepted, 2026-11-09
- Context: In 2021–22, 80 % of Armenian internet users used Viber, 62 % WhatsApp and 22 % Telegram (Caucasus Barometer, cited in `docs/05-business/positioning.md`). Many owners may not have Telegram.
- Decision: Keep Telegram for alerts and the day summary. Owners who don't use Telegram turn on web push notifications in the admin, which sends the same alerts to their phone's browser. On iPhones this works once the admin is added to the home screen.
- Rejected: a Viber bot (new bots cost €100 a month plus per-message fees, and need Viber's approval); WhatsApp Business messages (Meta charges per template message). Both break the free-only rule. SMS (paid per message).
- Consequences: The notification outbox gets a `web_push` channel next to `telegram`. The web push library goes through the Phase 2 dependency and license check before it's added. The human support chat can be in any messenger; it isn't a bot.

### ADR-036: Two plans, enforced in Postgres

- Status: Accepted, 2026-11-09. The owner delegated the Gate 5 decisions; prices are in `docs/05-business/pricing.md`
- Decision: `subscriptions.plan` is `menu` (free: QR menu, photo import, stop list) or `service` (paid: ordering, staff screens, Telegram, dashboard). Guest ordering functions and staff screens check the location's plan and status in Postgres; a location on `menu`, or `past_due` for more than 7 days, keeps its public menu and loses ordering. Every location starts with 30 days of `service` as a free month. Owners can export their menu, orders and bills as CSV from the admin at any time.
- Rejected: checking the plan only in the Next.js app (a direct RPC call would skip it); deleting data when a café stops paying.
- Consequences: Phase 6 migrations add `subscriptions.canceled_at`, `cancel_reason` and `converted_at`, rename the seed's `standard` plan, and add the plan check to `private.place_guest_order` and the staff RPCs. CSV export is a Stage 1 admin feature.

### ADR-037: Business metrics come from Postgres; PostHog only for the guest funnel

- Status: Accepted, 2026-11-09
- Decision: Add `kitchen_tickets.first_seen_at`, set when a kitchen screen reports that it has drawn the ticket, so order-to-kitchen time is measured in production. A `metrics_daily` table (one row per location per business day) is filled by `pg_cron` at 05:30 Yerevan time and read by platform admins through security-definer functions. PostHog tracks four guest events and nothing personal.
- Rejected: computing business metrics in PostHog (it would need order data and guest identifiers we don't want there); timing on the client clock (device clocks drift, R20).
- Consequences: Definitions and targets are in `docs/05-business/metrics.md`.

---

## Phase 6 decisions

### ADR-038: The app never holds the Supabase secret key

- Status: Accepted, 2026-11-09
- Context: The Phase 1 design gave the Next.js server the service-role key for guest orders, device pairing and background jobs. Two problems showed up when setting up the build. The tools this project is built with can read only a project's publishable keys, and secrets are never pasted into chat. And the service-role key is the one secret that bypasses every RLS policy (risk R14), so keeping it out of Vercel is safer anyway.
- Decision: Everything that needed the key moves into the database.
  1. Table QR tokens are signed and checked in Postgres (`private.sign_table_token`, `private.verify_table_token`) with HMAC-SHA256 keys stored in Supabase Vault as `qr_key_<kid>`. The keys are generated inside the database, so no person or tool ever sees them. The token format from ADR-006 doesn't change.
  2. Guests call `api.guest_join_table` and `api.guest_place_order` directly with their anonymous session. Each function checks the token, the session and the limits itself; the existing `private.*` functions stay as the internal core.
  3. A kitchen screen or waiter tablet signs in anonymously and redeems its pairing code with `api.redeem_device_pairing`. `private.is_real_user()` accepts an anonymous user only when it is an active device member, so guests still never match a staff policy. People join with `api.accept_invitation` after signing up.
  4. Background work runs in Postgres. pg_cron schedules it and pg_net calls the Telegram Bot API directly, with the bot token in Vault. Telegram's webhook goes to a small Next.js route that passes the update and its secret header to `api.telegram_update`, which checks the secret against Vault.
  5. Turnstile protects anonymous sign-in through Supabase Auth's own CAPTCHA setting instead of our server.
- Rejected: asking the owner to paste the key into chat (secrets never go through chat); injecting the key through the development network proxy (it would make test requests run as the service role and hide RLS bugs); Supabase Edge Functions for guest writes (a second runtime for no gain). Edge Functions stay the escape hatch for Auth admin tasks, since Supabase gives them the key automatically.
- Consequences:
  - Vercel holds only the publishable key and the AI provider key. `SUPABASE_SECRET_KEY`, `QR_SIGNING_KEYS`, `TELEGRAM_*`, `JOBS_SECRET` and `TURNSTILE_SECRET_KEY` leave the env list.
  - The plain-Postgres test harness stubs Vault and pg_net.
  - Some settings exist only in the Supabase dashboard, so the owner does them once: turn on anonymous sign-ins; turn off email confirmation for the pilot (the free email service only reaches the project's own team); raise the anonymous sign-in limit to about 300 an hour; later, add Turnstile and paste the Telegram bot token into Vault.
  - The cleanup job that deletes old anonymous users skips device members.

### ADR-039: The product is called Pativ (Պատիվ)

- Status: Accepted, 2026-11-09, chosen under the owner's delegation; easy to change
- Context: "Restaurant OS" was a placeholder. The pitch and the guest-facing app need a real name.
- Decision: Pativ, written «Պատիվ» in Armenian and «Патив» in Russian. «Պատիվ արեք» is what Armenians say when they set food in front of a guest, so the name is about hospitality without being a generic word like "menu" or "table". It's short, has no awkward meaning in Russian or English, and is easy to say in all three languages. Searches on 9 Nov 2026 found no Armenian business or app using it, and pativ.am was unregistered.
- Rejected: Seghan («Սեղան», table: too generic, and "gh" is hard for foreign guests); Tarkhun (a well-known soft drink brand); Tsiran (used by many businesses).
- Consequences: The UI reads the name from one message key (`brand.name`) and one constant, so a rename touches no logic. "Restaurant OS" stays as the internal project name in docs and code. Before spending money on the name (domain, printing, trademark), check the Armenian IP office register (aipa.am) and register pativ.am; both wait for the free-only rule to change.

### ADR-040: Telegram alerts are exceptions by default

- Status: Accepted, 2026-11-09
- Context: The video research (`docs/00-research/video-notes.md`, A4) heard owners say they want to be away from the café and hear only when something needs them. A busy café sends 70 orders in an evening; a message for each one teaches the owner to mute the bot and miss the late ticket.
- Decision: A new Telegram channel gets late tickets (`order.overdue`), a station screen offline (`station.offline`), a cancellation after serving (`order.comped`) and the day summary (`day.summary`). Every-order alerts (`order.placed`) are a switch in the Telegram settings, off by default.
- Rejected: every order by default (noise); no per-order option at all (some owners want it in the first week).
- Consequences: Migration `alerts_exceptions_default` changes the column default. The pitch, the onboarding test and the Friday walkthrough say so.


### ADR-041: Gemini model list for menu import

- Status: Accepted, 2026-11-09
- Context: Building the menu reader (Task 9.1) showed three things about the Gemini free tier. Each model allows 20 requests a day per project. Older models (gemini-2.5-flash) are closed to new users. And a response schema with length and count limits (`maxLength`, `maxItems`, `minimum`…) is refused with HTTP 400.
- Decision:
  - `GEMINI_MODELS` is a list, tried in order: `gemini-flash-latest`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite`. When a model's daily quota is used up or the model is gone, the reader moves to the next one. One import (all pages of a menu) is one request.
  - The adapter calls the `v1beta` API, where structured output and the newest models are.
  - The schema sent to the provider keeps the structure only; Zod checks the limits on the reply.
  - Briefly overloaded servers (500/502/503/504) get two retries, after 2 and 6 seconds.
- Measured on the two sample menus in `tests/fixtures/menus/` (rendered, not photographed): `gemini-3-flash-preview` read every dish and price, left a price range empty, found the sizes of a drink and skipped the address and Wi-Fi line; about 1,600 input and 800–1,300 output tokens per page. `gemini-3.1-flash-lite` also passed, with plainer translations ("Pork barbecue" for խորոված).
- Rejected: one fixed model (an import fails for everyone after 20 a day); a paid tier (free-only rule).
- Consequences: About 60 imports a day across all cafés while the list holds, plenty for the pilot (imports happen once per café, then on menu changes). The real check is still 15–20 photographed Yerevan menus from the field visits (`gaps.md`). The free tier may use prompts to improve Google's products; the import screen says so.

### ADR-042: Kitchen board calls made while building milestone 6

- Status: Accepted, 2026-11-09 (sensible calls under the owner's delegation; easy to change)
- Decisions:
  1. **Server clock from our own route.** Ticket timers use `GET /api/time`, measured three times at load (shortest round trip wins) and again every 10 minutes, on reconnect and on wake (R20). Not an extra database function, so the board works on the schema as it is; Vercel and Postgres clocks are both NTP-synced, the tablet's is the one that drifts.
  2. **Timers show whole minutes, recomputed every second.** As in the mockup («հենց նոր», «8 ր»): a mm:ss age can be mistaken for the wall clock from 2 m, and the colours still flip on the exact second (8 and 12 minutes, constants until a setting exists).
  3. **What the board hides.** Ready food of a table that has already paid (waiters forget "served", R18, so the column would grow all evening); an order slip with nothing left to cook after cancellations (its red void slip tells the cook). A slip whose line was partly cancelled shows the new quantity with the old one struck through beside it.
  4. **The screen's language is `locations.kitchen_locale`** (i18n.md), for the chrome as well as the dish names. Names fall back hy → ru → en and carry `lang` when they differ.
  5. **No «Մատուցված է» on the kitchen board.** The mockup gives the Ready column «Վերադարձնել» only; serving is the waiter's tap (milestone 7).
  6. **Outbox conflicts drop the rest of that ticket's queue.** After a `stale_status` answer, later queued taps on the same ticket were made on a wrong picture, so they go too; one «Արդեն փոխվել է» per ticket, then a refetch. Kitchen-busy and stop-list changes are not queued: they need a connection and say so.
  7. **A disconnected device notices within one poll.** RLS makes a revoked device read nothing, which looks like a quiet kitchen; when the 10-second poll can no longer see its own location, the board shows «Այս սարքն անջատված է։». The heartbeat (60 s) and a refused tap say the same.
  8. **Stop list entries last the business day:** `until` is the next `business_day_starts` in the location's time zone.
  9. **The system's default station named "Kitchen" is shown as the localized «Խոհանոց»**; stations an owner named keep their name. Other stations of the location are links in the top bar, so a bar device paired to the default station can switch.
  10. **`api.set_kitchen_busy` also broadcasts a `location` event** on `loc:<id>`, so the other screens of the location update at once.

### ADR-043: Guest menu and ordering calls made while building milestones 4–5

- Status: Accepted, 2026-11-09
- Decisions:
  - **JavaScript budget.** The brief's "under 100 KB" for the guest menu can't be met on Next 16: the framework alone is about 148 KB. The menu route adds 9.2 KB of its own (145 KB in total). next-intl's client provider is gone from the guest layout, guest strings use a 1 KB formatter, and the Supabase client loads only when a guest sends an order. A test fails if the route's own code passes 25 KB.
  - **QR entry is a route handler,** so a bad or old sticker gets a real HTTP 404 with a small self-contained page in hy, ru or en; a Next 16 page sends its 404 as an empty shell filled in by JavaScript.
  - **Language switch** reloads the page, so `<html lang>` always matches.
  - **Button wording** follows the guest mockup: «Ուղարկել խոհանոց», «Խնդրել հաշիվը».
  - **Ordering off (Menu plan):** no add buttons and a calm notice; a cart that already has items explains that the waiter takes orders.
  - **Possible duplicates:** the same dishes (same ids, same total quantities, options ignored) from another guest session or the waiter at the same table within 3 minutes wait for the waiter.
- Consequences: Migrations `20261109190200_guest_possible_duplicates` and `20261109190300_guest_service_requests` (renumbered at merge so every version is unique).

### ADR-044: Telegram and web push calls made while building milestone 8

- Status: Accepted, 2026-11-09 (sensible calls under the owner's delegation; easy to change)
- Decisions:
  1. **Delivery runs in Postgres, every 10 seconds.** pg_cron runs `private.run_notifications()`: it reads pg_net's answers for rows in flight, then sends due rows. The order transaction only inserts outbox rows (ADR-016). A row in flight holds a 2-minute lease; no answer by then is a failure.
  2. **Retries at 1, 5 and 15 minutes, dead after 5 failures** (the plan's numbers; ADR-016 said 8 attempts). Telegram's 429 waits `retry_after`. "Bot was blocked" or "chat not found" turns the chat off and kills the row at once. Alerts that could not go out for 6 hours are dropped as `stale`, so a late token doesn't flood the owner with yesterday's orders.
  3. **No token, nothing happens.** Without `telegram_bot_token` in Vault rows wait as `pending` and nothing errors; the admin page says the bot isn't ready and offers phone notifications instead.
  4. **Bot replies ride on the webhook's answer.** `/start <code>`, `/stop` and wrong codes are answered by returning a Bot API method from `/api/telegram`, so linking needs no outgoing call and no token in the app. Link codes are 16 URL-safe characters, stored hashed, valid once for 30 minutes; a chat gets the language of the person who made the link. Removing the bot from a group or blocking it turns the chat off.
  5. **"During opening hours" without an opening-hours setting.** A kitchen screen is reported offline after 2 minutes without a heartbeat only while the café is serving: a table is open or an order came in during the last 45 minutes. One alert per outage.
  6. **"At closing time" for the day summary.** After 21:00 local time, once every table is closed and no order came in for an hour; if the café never got quiet, in the first three hours of the next business day. Days without orders send nothing. Test orders are left out.
  7. **Late tickets:** 20 minutes (a constant until the Settings screen has the field), one alert per order, tickets older than 3 hours are forgotten ones and not reported.
  8. **Web push without a library.** RFC 8291 encryption and RFC 8292 VAPID take about 100 lines on Node's crypto and are checked against the RFC 8291 test vector, so no dependency and no license review. The database can't encrypt, so pg_net posts `{id, attempt, sig}` to `/api/push`; the signature is an HMAC with `push_job_key` from Vault, valid for one attempt. The route trades it for the text and the devices (`api.push_claim`) and reports each push service's answer (`api.push_report`); 404/410 removes the device. The VAPID keys are Vercel env vars made by `scripts/gen-vapid.ts`, never printed.
  9. **Each person's phones are one `web_push` channel** with the same event switches and texts as Telegram; Telegram chats are shared by the café's owners and managers.
  10. **Configuration in Vault, not in tables:** `telegram_bot_token` (owner), `app_base_url` (where `/api/push` lives), optional `vercel_bypass_secret` (Vercel's "Protection Bypass for Automation", so pg_net and Telegram reach a protected preview). `telegram_webhook_secret` and `push_job_key` are generated inside the database.
- Rejected: an npm web-push library (a dependency for 100 lines of standard crypto); sending from a Next.js cron (needs a secret key or a job secret in the app, ADR-038); an opening-hours table now (one more setting before the pilot needs it).
- Consequences: Migrations `20261109200000_telegram_link`, `20261109200100_notification_delivery`, `20261109200200_web_push`. The harness stubs pg_net and pg_cron. The admin page is `/admin/telegram`.

### ADR-045: Sales dashboard, plans, export and platform admin calls made while building milestone 10

- Status: Accepted, 2026-11-09 (sensible calls under the owner's delegation; easy to change)
- Decisions:
  1. **The owner's dashboard reads one function, `api.sales_dashboard(location, from, to)`**, not `metrics_daily`. Today has to be live, and the numbers need joins across orders, items, tickets, bills and history that RLS-only reads would turn into a dozen round trips (and PostgREST's 1,000-row page). The function checks `owner`/`manager` at the location and caps a range at 93 days. `metrics_daily` stays the platform's history, filled by pg_cron (`pativ-metrics-daily`, 01:30 UTC = 05:30 Yerevan) as ADR-037 says; owners can also read their own rows through RLS.
  2. **What counts.** Money from paid bills only (void bills and open tables left out; open tables are a separate tile, screens.md 13). Orders, dishes, hours and sources from real orders (`accepted`, not `is_test`). Cancelled quantities come off a dish's count; reasons come from `order_status_history`.
  3. **Comparison: the same weekdays, shifted back by whole weeks** (7 days for a day or a week, 14 for 8–14 days…). When the range includes today, the comparison stops at the same time of day, so a lunchtime look isn't compared with a full evening.
  4. **"Weakest dishes" are the active menu dishes ordered least in the range, including those never ordered**, excluding the top five. A dish nobody orders is the most useful thing to show an owner.
  5. **No chart library.** The hour chart is about 100 lines of HTML and CSS in a server component: tarragon columns for the period, a grey level mark for the comparison, a legend, native tooltips and a table view. No client JavaScript and no dependency; Recharts would add a client bundle and a license review for one chart.
  6. **The dashboard isn't hidden on the Menu plan.** A Menu-plan café takes no orders, so it has no numbers; the plan banner says why. Plan state in the admin mirrors `private.location_can_order` (`src/features/billing/plan.ts`); Postgres still decides.
  7. **CSV export reads through the owner's own session and RLS**, filtered by the café as well, paged past 1,000 rows. It's a BOM-prefixed, CRLF, RFC 4180 file so Excel opens Armenian text, and text that a spreadsheet would run as a formula gets a leading apostrophe. Column names come from the messages; status and source values stay as their codes. One route per file: `/admin/export/{menu,orders,bills}`, linked from `/admin/export`.
  8. **The platform admin changes plans by hand** (Stage 1 bills by invoice): `api.platform_set_plan` sets the price (15,000 ֏, or keeps a founding café's existing price; 0 for Menu and the free month), `converted_at`, `canceled_at` and a month's `current_period_end`, and writes the audit log. "Devices online" means a heartbeat in the last 5 minutes; "offline devices" are active devices silent for over a day (opening hours come later, ADR-044).
  9. **Admin navigation is a layout around `/admin/**`**, from the mockup's sidebar; below 1024 px it is a scrolling row of tabs. `/admin/new` moved to an `(onboarding)` route group: a layout survives client navigation, so one drawn before the café existed would never show the sidebar after "Create".
- Consequences: Migration `20261109203000_dashboard_platform`. Its e2e tests skip until it is applied to the dev project (`E2E_M10_MIGRATION=applied`); the platform test also needs a platform admin account (`E2E_PLATFORM_EMAIL`, `E2E_PLATFORM_PASSWORD`).

### ADR-046: Waiter app calls made while building milestone 7

- Status: Accepted, 2026-11-10 (sensible calls under the owner's delegation; easy to change)
- Decisions:
  1. **Stale-table guard (ADR-033 (4), R8) as a separate "waiting" session.** A table "looks finished" when it has an accepted order, nothing waits for acceptance, every accepted order is served, and the guests asked for the bill or nobody ordered for 45 minutes. A new phone joining such a table gets a `table_sessions` row in the new `waiting` state instead of the old bill; the floor shows «Նոր պատվեր» and «Սեղան 6․ նոր հյուրե՞ր». Their orders never reach the kitchen by themselves: a `before update` trigger skips the automatic acceptance and `api.accept_order` answers `table_needs_closing`. The waiter either closes the old bill (`api.settle_table_session` then opens the waiting session; its orders still wait for «Ընդունել») or taps «Նույն հյուրերն են» (`api.seat_waiting_guests` moves the phones, orders and requests to the open bill). Phones that already belong to the old party keep it. This way `private.place_guest_order` (ADR-043) is not redefined.
  2. **One tap on «Գնում եմ» resolves the call** (`api.resolve_service_request`, idempotent). The guest can call again at once. Closing a table also resolves that table's open requests, so the next party doesn't start red.
  3. **Settling accepts cash and card only** (`card_terminal`), as the mockup offers; other methods are refused (`invalid_payments`) until Stage 3 brings online payment.
  4. **What is queued and what isn't.** Accept, reject, «Մատուցված է», «Գնում եմ» and the order pad go through the IndexedDB outbox (one per device user) and show at once with «Ուղարկվում է…» until a refresh confirms them. Settling, «Նույն հյուրերն են» and cancelling a line need a connection (realtime.md). A conflict shows «Արդեն փոխվել է» (or «Արդեն մատուցված է», «Նախ փակեք հին հաշիվը։») and refetches; after one, later taps on the same order or ticket are dropped (ADR-042, 6).
  5. **Floor layout.** Tables are drawn at `pos_x`/`pos_y` cells when every table of an area has them; otherwise (today: the tables editor has no positions yet) they flow in a grid by `sort`, then by label as a number. Round tables are circles, `rect` tables take two cells. Areas are tabs; tables without an area come last as «Այլ սեղաններ».
  6. **Live data.** Broadcast hints on `loc:<id>` trigger one refetch, debounced by 300 ms; a 15-second poll and a refetch on reconnect and on wake cover a dead socket (realtime.md). The location is the first one the member may see; a waiter device is paired to one.
  7. **The panel total is what the bill will be:** accepted orders only. Rejected rounds stay listed with their reason; a QR order that may be a duplicate (ADR-043) carries «Կարող է կրկնված լինել».
  8. **Reject and cancel reasons are short choices**, stored as text in the waiter's language (the guest page shows `reject_reason` as written). A waiter who opens «Չեղարկել» on served food sees that a manager must do it instead of a form; the database checks the same.
  9. **No sound on the waiter tablet yet.** The colour pulse and the counter carry new orders; sound and web push for waiters come with milestone 8's push channel if cafés ask.
- Consequences: Migration `20261109204500_waiter_app` (adds the enum value `waiting`, used only inside function bodies so it applies in one transaction). Its e2e tests (calls, the stale-table guard) skip until it and `20261109190300_guest_service_requests` are applied to the dev project.

### ADR-047: Calls made in the security review (Task 11.2)

- Status: Accepted, 2026-11-10 (sensible calls under the owner's delegation; details in `docs/06-build/security-review.md`)
- Decisions:
  1. **Web push only to the browsers' push services.** Endpoints must be https on `fcm.googleapis.com`, `android.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com` or `*.notify.windows.com`; the app, the server action and a table constraint all check it, and `/api/push` doesn't follow redirects. A new browser's push service means one line in each place. Rejected: resolving and blocking private IPs at send time (DNS rebinding makes that fragile, and nothing else is a legitimate endpoint).
  2. **A static CSP, with `'unsafe-inline'` for scripts and styles.** A nonce-based policy would make every page dynamic, including the statically rendered guest menu. The static policy still allows scripts only from our origin and network calls only to us and the Supabase project. Revisit if a third-party script is ever added.
  3. **`minimatch` advisory accepted rather than overridden.** The override planned in `dependency-audit.md` pulls in a package first published two weeks ago; the advisory is a denial of service through glob patterns only our ESLint config supplies.
  4. **Storage paths on rows are constrained in the table**, not only in RPCs, because owners and managers can update menu rows directly through RLS.
  5. **`members.pin_hash` is left out of the `select` grant**; Stage 2's PIN check goes in a SECURITY DEFINER function.
  6. **The SQL harness reproduces Supabase's default grants in `public`**, and `supabase/tests/sql/rls_coverage.sql` sweeps every public table from the catalog for each role, so a new table is covered without writing a test for it.
- Consequences: Migration `20261110100000_security_review` (constraints and a column grant; no new functions or tables), not yet applied to the dev project.
