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

### ADR-048: Staff PWA, accessibility and overflow calls (Task 11.1)

- Status: Accepted, 2026-11-10 (sensible calls under the owner's delegation; easy to change)
- Decisions:
  1. **One manifest for the origin, started at `/pair?source=app`.** `app/manifest.ts` (Armenian name and description from `messages/hy.json`, PNG icons 192/512 plus a maskable one in `public/icons/`). The service worker turns that start URL into a 302 to the last staff screen it saw, online or offline; a device never paired gets the pairing page. Next.js links the manifest from every page, so a guest's browser may also offer to install; that is harmless and not worth a second manifest. The manifest can't follow each member's language, so it stays in the reference language.
  2. **What the service worker caches** (`public/sw.js`, extended, push handling unchanged): cache first for hashed `/_next/static` files and the icons; network first for the HTML of `/kitchen/<station>` and `/waiter` only, at most three screens plus a pointer to the last one. Never cached: other origins (Supabase REST and Realtime), `/api/*`, non-GET requests, RSC fetches, guest and admin pages. The cached staff HTML holds what the screen showed (tickets, table labels, guest notes), which is exactly what "opens offline at its last state" needs. A disconnected device is redirected by the server, and the worker then forgets that screen, so a revoked tablet doesn't reopen its old board offline.
  3. **Registration lives in an `(staff)` route-group layout** (`src/lib/offline/sw-register.tsx`). On the first visit the worker doesn't yet control the page, so the page posts the build files it loaded and the worker caches them and the screen; one online visit is enough. Works under ADR-047's CSP (`worker-src 'self'`, `manifest-src 'self'`; the worker only fetches our own origin).
  4. **No offline fallback page.** An uncached page offline shows the browser's own error; an offline page would need its own copy of the messages. Staff screens are the only ones that must open offline.
  5. **Accessible names come from what a control shows.** Waiter table buttons and order-pad dishes had `aria-label`s that didn't contain their visible text (axe `label-content-name-mismatch`, serious). They now build their names from their content with visually hidden words («Սեղան», «Ավելացնել՝») through rich messages (`waiter.tableName`, `waiter.pad.addItem`); a table reads «Սեղան 1 Ազատ»; the old `waiter.tableAria` and `waiter.pad.add` keys are gone.
  6. **Long table labels shrink.** A label longer than four characters (e.g. «Պատշգամբ 12», the database allows 12) is drawn at 36 px instead of 64 px on kitchen slips and at 20 px instead of 30 px on the floor map, and may break anywhere rather than spill out of the slip or button. Numbers keep the full size of the kitchen spec.
  7. **Overflow means more than page scroll.** `tests/e2e/overflow.spec.ts` also fails on text that runs out of its box or is cut off, and on boxes that scroll sideways without being meant to (tab rows say so with `overflow-x-auto`). That found the kitchen board's columns widening past a phone screen and clipping slips on a tablet, and the menu editor reserving the side panel's column while it was closed (dish rows crushed at 1280 px).
  8. **Every screen at every width.** The kitchen board and waiter app are designed for tablets, but they're also checked at 390 px: owners open them on phones. Checks run with the longest names the database allows (café name, dish names in three languages, a 12-character table label, a long kitchen note, a 9 990 000 ֏ price) on a fresh café per worker.
  9. **`@axe-core/playwright` 4.14.0 (MPL-2.0) as a dev dependency**, allowed for build and test tools by the license policy. axe runs with the WCAG 2.0–2.2 A/AA and best-practice tags; only serious and critical findings fail.
- Consequences: Screens that need migrations not yet applied to the dev project are skipped with the migration's name: `/admin/telegram` (`20261109200000_telegram_link`) and `/admin/dashboard` (`20261109203000_dashboard_platform`); the menu-import review page and `/platform`'s list need data those migrations create and aren't in the list yet. The menu editor's sold-out rows use the muted text colour instead of 50 % opacity (contrast 3.2:1 failed AA).

### ADR-049: Web push for guests and waiters (free, on the ADR-035 pipeline)

- Status: Accepted, 2026-11-10 (sensible calls under the owner's delegation; free only: browser push services, VAPID keys of our own, no paid service)
- Decisions:
  1. **Same pipeline, new audiences.** A web push is still an outbox row → `pg_net` → `/api/push` (signed per row) → RFC 8291 send. `notification_channels` gets an `audience` (`owner`, `waiter`, `guest`) and a `guest_session_id`. Waiter and guest channels have no alert events, so the owners' event queueing never reaches them; two small queueing functions feed them (`private.enqueue_guest_push`, `private.enqueue_waiter_push`). The owner's Telegram page lists only `owner` channels.
  2. **Guest: «Տեղեկացնել, երբ պատրաստ լինի».** A button on the order status page (shown while the latest order is received, accepted or cooking) asks permission, subscribes and calls `api.guest_push_subscribe(guest_session_id, subscription)`. The function checks that the caller owns an open guest session, accepts only the browsers' push services (ADR-047) and well-formed keys, caps the body at 2 000 bytes, allows 3 phones per guest session and 10 calls an hour. The database builds the notification: when an order's kitchen status becomes `ready` (a trigger on `orders`, only for guest orders), one row is queued for that guest session, deduplicated by order, so "ready, undo, ready" sends once. The text is rendered in the order's language: «Ձեր պատվերը պատրաստ է՝ սեղան 5» / «Ваш заказ готов — стол 5» / "Your order is ready — table 5". The path is the guest status page with the table's signed sticker, built in the database.
  3. **Guest devices are short-lived.** They are deleted when the table session closes or the guest session is revoked (triggers) and, as a backstop, after 24 hours or when the guest session has expired (`pativ-guest-push-cleanup`, every 15 minutes, pg_cron). Channels cascade to devices and queued rows.
  4. **Waiter: «Ծանուցումներ այս սարքում».** A switch in the waiter header calls `api.waiter_push_subscribe` (owner, manager or waiter, a paired tablet included; up to 5 devices per person). A new `service_requests` row, or a card/cash choice on an open bill request, queues a row for each subscribed active member who may see the location: «Սեղան 5․ կանչում են», «Սեղան 5․ հաշիվ», «Սեղան 5․ հաշիվ՝ քարտով». Resolving a request and repeat taps push nothing. In the spirit of ADR-040 only calls and bills push, never every order.
  5. **Notification behaviour.** Tags are per order (`order:<id>`) and per table and kind (`table:<id>:service.call`), so a repeat replaces the earlier notification and, with `renotify`, buzzes again. A tap opens the guest status page or `/waiter`; an open window of that page is focused (or navigated when the link differs). The service worker accepts only paths on its own origin. `push_claim` decides tag, link and `renotify` per event; owner alerts are unchanged.
  6. **Live notifications go stale in 15 minutes**, not 6 hours: a call from last night is noise.
  7. **No sound or app badge** beyond what the browser's notification does. Texts live in the database (`private.render_notification`), as for Telegram; the page's button and the waiter switch use `messages/*.json`.
- Limits:
  - **iPhone.** Safari delivers web push only to a page added to the home screen (iOS 16.4+). The guest button then gives way to a short note and the live status page keeps working; the waiter switch says the same. A waiter tablet installed from the home screen works.
  - One browser has one subscription per origin: the same browser used as a guest, then as a waiter or owner, moves its single subscription (the endpoint is unique). Not a problem on separate devices.
  - Push services may delay or drop a message; the status page and the waiters' floor map stay the source of truth.
- Consequences: Migration `20261110130000_push_guests_waiters` (not yet applied to the dev project; CI applies it on push). Its e2e test skips until then. VAPID keys must be set in the environment (`scripts/gen-vapid.ts`); without them the guest button is hidden and the waiter switch is absent, and nothing else changes.

### ADR-050: Pilot readiness: nightly backup and automatic test-data clean-up

- Status: Accepted, 2026-11-10 (sensible calls under the owner's delegation; free only: GitHub Actions and `pg_cron`)
- Decisions:
  1. **One cloud project hosts CI test cafés, the demo and the pilot café**, so a daily job (`pativ-purge-test-data`, 02:40 UTC) calls `private.purge_test_cafes()` and `private.purge_demo_activity()`. A café is a test café only if it has an owner, is older than a day, is not `demo-cafe`, and every person member has an `@pativ.test` email (the address all e2e helpers sign up with). One real member keeps it. Test users with no café are deleted afterwards, never platform admins. Anonymous users are left alone.
  2. **Demo café keeps its menu, tables and stations**; only its orders, bills, table and guest sessions and service requests older than a day are deleted.
  3. **Both functions are `SECURITY DEFINER`, executable by the owner only**, in line with ADR-038; the app never needs the secret key for this.
  4. **Nightly backup in GitHub Actions** (`.github/workflows/backup.yml`, 03:17 UTC): schema, data and `auth` data via `supabase db dump`, compressed, optionally `age`-encrypted, kept 14 days as an artifact. It needs a database password or pooler URL as a secret (a dump connects to Postgres; the access token is not enough) and skips with a notice without one. It connects through the session pooler because GitHub runners have no IPv6.
- Consequences: Migration `20261110140000_purge_test_data` (applied by the CI `migrate` job; it also purges once on apply). The owner adds `SUPABASE_DB_PASSWORD` (or `SUPABASE_DB_URL`) and, preferably, `BACKUP_AGE_PUBLIC_KEY` as repository secrets and does one restore drill (RB5). Free-plan retention is 14 days of artifacts; no paid backup is used. Details in `docs/04-operations/backups.md`.

### ADR-051: Guest screens: "Noir & Champagne", full-width layout, Stardom from Fontshare, signature-dish cylinder

- Status: Accepted, 2026-11-17 (the owner asked for a guest UI that fills PC screens, a more luxurious palette, the Stardom font and a 3D circular carousel; the rest are sensible calls under the Gate 5 delegation; free only)
- Decisions:
  1. **Responsive guest screens.** The 430 px phone column is gone. The header and the slim bar are full-width noir bands; content sits in a centred column of at most 1 200 px (16 px side gutters on phones, 32 px from 768 px). Dishes stand in one column on phones, two from 768 px; from 1 024 px the section tabs become a sticky sidebar on the left (the elegant alternative to three columns: names in a display face need the width). The cart bar is centred and at most 560 px wide. The dish sheet stays a bottom sheet on phones and becomes a centred dialog (max 560 px) from 768 px. The cart and the order status page are a 720 px column; the games strip there shows about three cards on a desktop.
  2. **"Noir & Champagne" palette, guest screens only.** The guest layout (`app/[locale]/(guest)/layout.tsx`) puts `.guest-lux` on its root. That class in `globals.css` is the theme preset (it is to become the "Evening" preset): every guest colour is a `--guest-*` custom property defined there and nowhere else, and it remaps the design tokens (matsoni, ink, muted, line, tarragon, apricot, pomegranate, basalt, …) onto ivory `#f6f1e7`, paper `#fffdf8`, noir ink `#1b1712`, taupe `#6f655a`, hairline `#e4d9c6`, champagne `#a8844e` (decoration and large text only: 3.1:1 on ivory), deep gold `#7f6135` for small gold text (5.1:1 on ivory, 4.6:1 on the gold tint), wine `#7a1e2c`, and a success green `#2e6a4a`. The brief's `#8a6a37` measured 4.44:1 on ivory, just under AA, so the deep gold is one step darker. On noir, gold text uses `#d2b27a` (8.8:1) and muted text `#bfb29c` (8.5:1). Utilities such as `bg-noir` or `text-gold-deep` come from an `@theme inline` block that points at the preset's variables, so they resolve only inside the guest theme. Staff, admin and kitchen screens keep direction A unchanged; the only shared change is a `success` token (falls back to tarragon outside the guest theme) for the vegan tag.
  3. **Stardom through the Fontshare API, never in the repository.** Stardom (Indian Type Foundry, ITF Free Font License) may be used free in commercial work, but §02 of the licence forbids redistributing the font files, including through public repositories, and this repository is public. The guest layout preconnects to `api.fontshare.com` and `cdn.fontshare.com`, preloads `https://api.fontshare.com/v2/css?f[]=stardom@400&display=swap`, and a tiny client component attaches the stylesheet once the page is up, so a slow or blocked Fontshare never delays the menu (headings show in the Noto serifs and swap). The CSP allows `https://api.fontshare.com` in `style-src` (and in `connect-src`, because tools that read the page's stylesheets, axe in our e2e tests among them, fetch it) and `https://cdn.fontshare.com` in `font-src`; nothing else changes.
  4. **Glyph coverage.** Stardom has Latin glyphs only: no Armenian, Cyrillic or ֏. The guest display stack is `"Stardom", Noto Serif Armenian, Noto Serif, Georgia, serif`, so the browser falls back per glyph: Armenian headings render in Noto Serif Armenian, Russian ones in Noto Serif, English ones in Stardom. Stardom has a single weight, so display text turns off font synthesis and the Noto serifs drop to weight 500 to sit next to it. UI text stays in Google Sans.
  5. **Signature-dish cylinder.** `CircularCarousel` is our own component (no library, about 2 KB gzipped) with the API shape the owner pasted (`items {src, alt, title, subtitle}`, `preset="cylinder"`, `intro="rise"`, `cardWidth`, `aspectRatio`, `speed`, `captions`). `speed` is degrees per second (14 → one turn in about 26 s). It shows dishes with a photo that are not sold out, popular ones first, up to 10, and hides itself below 3; fewer than 6 dishes are repeated round the cylinder (the repeats are hidden from screen readers and the keyboard). Drag or swipe with inertia; hover, touch and focus pause it; arrow keys, Home and End move between cards and each card is a button opening the dish sheet. It turns only while on screen and the tab is visible. With `prefers-reduced-motion` it is a plain sideways-scrolling row.
  6. **The cylinder is interim.** The owner plans to replace it with a gallery later; it sits behind one usage in `guest-menu.tsx` and can be swapped without touching the rest.
- Consequences: Guest menu JavaScript beyond the framework grows by the carousel (10.7 KB → 14.9 KB beyond the framework in the e2e budget test, limit 25 KB). If Fontshare is unreachable, English headings stay in Noto Serif. Moving to self-hosted Stardom would need a private asset store, not this repository.

### ADR-052: Guest themes per café, card layout, bottom bar, Motion effects

- Status: Accepted, 2026-11-17 (the owner picked the three themes, the card layout of `menu-layout.webp`, the bottom bar of `bottom-nav.png`, the fonts and the four React Bits effects; the rest are sensible calls under the Gate 5 delegation; free only)
- Decisions:
  1. **Three presets, chosen per café.** `restaurants.guest_theme` (`evening` default, `wine`, `soft`; check constraint), returned by `api.public_menu` as `restaurant.guest_theme`. `api.set_guest_appearance(restaurant, theme, brand_color, logo_path)` saves theme, brand colour and logo in one call (owner or manager, `SECURITY DEFINER`, empty `search_path`, audit row); the column has no direct update grant. The never-picked Coffee and Daylight presets are removed. Admin page `/admin/look` («Հյուրի էջի տեսքը»): three cards with a live miniature drawn with the real theme tokens, brand colour (colour input, off by default) and logo upload (resized to 256 px WebP into the café's own `menu-images/<id>/logo/` folder). Before the migration is applied, the page says so and the guest pages wear Evening.
  2. **Tokens.** Every guest colour, radius and shadow is a `--guest-*` property in `globals.css`; utilities (`bg-page`, `bg-surface`, `bg-accent`, `text-on-accent`, `text-accent-text`, `rounded-card`, `rounded-pill`, `shadow-card`, …) read them through `@theme inline`, and the older tokens (matsoni, ink, muted, line, tarragon, basalt, …) are mapped onto them, so untouched screens (order status, games, notifications) follow the theme. The page that knows the café wraps its content in `GuestThemeScope`, which re-applies `.guest-lux` with `data-guest-theme` and the brand colour; the layout root wears the default. `generateViewport` sets the browser bar to the theme's page colour.
  3. **Wine** (dark; colours and shape from the owner's style reference, no name, font, wordmark or photos): canvas `#260212`, cards `#4f0423`, black hairlines, one red `#e10600` for every action, blush `#ffc7c6` for soft text and inactive pills, flat, 15 px pills, 12 px cards, 38 px feature card. White on `#e10600` measures 4.97:1, so the red is kept. Red text on burgundy would be 3.1:1, so small accent text is blush; the red is used as text only for the café name and section headings (large text, 3.8:1 on the canvas). **Soft** (light): canvas `#eceef1`, white cards on soft two-sided (neumorphic) shadows, ink `#1d1f24`, thin serif headings (Noto serifs at weight 300), red `#e10600` fills, deeper red `#c00500` for small text (5.5:1). **Evening** keeps ADR-051's palette.
  4. **Brand colour** replaces the accent (fills, active tab, badges, glow); text on it is white or black, whichever contrasts more; it also colours small accent text only where it keeps 4.5:1 on the page and cards (`brandStyle`, unit-tested). The admin page warns when it doesn't.
  5. **Layout.** A very large display title (the café name) with the logo, table chip, language switch and round icon buttons (search, order with count) above it; a sticky row of category pills; dishes as cards in a grid: **two columns on phones** (as in the picture; one below 360 px), three from 768 px, two beside the order panel from 1 024 px, three from 1 280 px. Two columns hold Armenian names at 19 px in the display serif: long names wrap onto more lines and the card grows, prices never wrap. Each card: round plate photo with a soft shadow, or an empty plate with the dish's initial (grapheme) when there is no photo; name, price, portion, tags, sold-out; a round "+" hanging off the corner. A section of three or more dishes leads with a **featured card** across the row (first popular dish with a photo, else first with a photo), its plate bleeding off the card's edge. The signature-dish cylinder (ADR-051 decision 5) is replaced by these featured cards.
  6. **Order panel and bottom bar.** From 1 024 px a sticky "Your order" panel on the right lists the chosen dishes on round plates with quantity and ×, the total and the "View order" StarBorder; below that width the same button, with the last three plates, sits on top of the bottom bar. The cart review and sending stay on `#cart` (unchanged flow, idempotent send). The bottom bar is a floating pill: Menu · Order (count) · Waiter on the menu; Menu · Order · Games (while games show) · Waiter on the status page. The current item glows with a radial highlight in the theme's glow colour; items are ≥ 56 px tall; it clears the home indicator. The menu's waiter call keeps its two-tap confirmation, now shown just above the bar; on the status page the Waiter item makes the same request as the page's button. The games' floating "back to the games" button is gone: the bar's Games item replaces it. The toast sits above the bar.
  7. **Effects (React Bits, re-implemented; MIT + Commons Clause, used in our product, attribution in each file).** Engine: Motion (`motion` 14.9.0, MIT) through `motion/mini`'s `animate()` (WAAPI) and Motion's `spring` generator, about 5 KB gzipped, fetched with a dynamic import when the browser is idle after the menu is up; `motion/react`'s components would be 45 KB. _Split Text_ splits by grapheme (`Intl.Segmenter`) and keeps words whole: the café name rises at first paint in CSS (it must show at once on 3G, before Motion arrives); section headings rise with Motion the first time they scroll into view. _Rotating Text_ rotates the café's category names under the title («Այսօր ճաշացանկում՝ …»), all words stacked in one grid cell so the line never reflows; only on screen and with the tab visible. _Tilted Card_ leans dish cards towards the pointer on a spring, and towards the finger while pressed (half as far, never blocking scroll). _Click Spark_ bursts eight rays from "+" and from "Add" in the sheet. Under `prefers-reduced-motion` none of them runs; nothing else animates.
  8. **Icons** are Lucide (`lucide-react` 1.67.0, ISC, imported per icon; `sideEffects: false`, so only the used icons ship). The guest's own small icons (plus, minus, close, back, check, bell) moved to Lucide for one stroke style.
  9. **Fonts** unchanged from ADR-051: Stardom for Latin display text and Switzer for Latin body text (Fontshare API, never in the repository), Noto Serif Armenian and Noto Sans Armenian for Armenian, Noto Serif and Google Sans for Cyrillic. Display weight and width are per preset.
- Consequences: Migration `20261117120000_guest_theme` (CI applies it); SQL tests in `supabase/tests/sql/guest_theme.sql`. Until it is applied, `public_menu` has no `guest_theme` and every café shows Evening; `/admin/look` shows a notice and can't save. The order status page now also reads `public_menu` (request-cached) for the café's look. The guest menu's own JavaScript stays inside the 25 KB budget (see the report in the session).

## ADR-053: npm audit gate with a reviewed, expiring allowlist

**Date:** 17 Nov 2026. **Status:** accepted.

**Context.** CI ran `npm audit --audit-level=high`, and the `migrate` job waits for it. Advisory GHSA-fc5q-39xc-vjpf (picomatch ReDoS) has no fixed release (the latest picomatch, 4.0.7, is affected), so the gate failed on every push and blocked migrations. picomatch reaches us only through build and dev tooling (eslint, vite, vitest, tinyglobby, and @parcel/watcher under next-intl), matching patterns from our own config; no guest input reaches it and it is not on any request path.

**Decision.** CI runs `node scripts/check-audit.mjs`: npm audit, failing on any high or critical advisory except those in `.audit-allowlist.json`. Each entry has a reason and an `until` date; an expired entry fails the build, so it is reviewed again. The first entry is GHSA-fc5q-39xc-vjpf until 31 Dec 2026.

**Consequences.** Real new high/critical advisories still stop CI. Remove the entry once picomatch ships a fix (then `npm update` / overrides).

### ADR-054: Staff screens (waiter, kitchen) follow Apple's HIG: neutral, icon + word + colour, dark kitchen board

- Status: Accepted, 2026-11-17 (the owner's brief for the staff side; the rest are sensible calls under the Gate 5 delegation; free only, no new dependency)
- Decisions:
  1. **No theme presets on staff screens.** The guest themes (ADR-052) never reach `/waiter` or `/kitchen`. Staff screens use direction A's green (tarragon), amber (apricot) and red (pomegranate) for meaning, on neutral, system-like greys added as tokens in `globals.css`: `staff-bg` `#f2f3f5`, `staff-fill` `#e6e8ec`, `staff-sep` `#d5d9df`, `staff-label2` `#565d67` (secondary text, 6.0:1 on `staff-bg`), `amber-text` `#8a5300` (amber text on white, 6.3:1); for the dark board `basalt-4` `#31423a` and `late-on-dark` `#d0384a` (white on it 4.8:1, 3.4:1 against the column). Type is the UI font (Google Sans, all three scripts) in an iOS-like scale (34 px large title, 28 px screen title, 17 px body, 15 px secondary, 13 px captions); the serif display face and Fontshare fonts are not loaded on staff screens. Icons are Lucide only.
  2. **Never colour alone.** Every table state on the waiter's map has a colour, an icon and a word: Free (dashed circle), Seated (people), New order (clipboard), Ready (hand with platter), Calling (ringing bell), Bill (receipt, or card / banknote when the guest said how they will pay). The legend repeats the three. On the kitchen board each ticket's head band is its timer: grey with a clock while on time, amber with an hourglass and «Շտապել» from 8 minutes, red with an alert sign and «Ուշանում է» from 12 (the thresholds in `lateness.ts` are unchanged), and the 4 px border takes the same colour. A cancellation has a light band with a "no" sign and «Չեղարկվել է», so it never looks like a late order. Selected choices (reasons, payment) are tinted, ringed and ticked.
  3. **Waiter app.** Sections Tables · Orders · Calls in a bottom pill tab bar (the guest dock's shape in neutral colours, 56 px items, badge counts read after the name). Orders and Calls are lists derived from the same floor data (`inbox()` in `floor-model.ts`, unit-tested): new and ready orders, calls and bill requests, one row per table, the longest-waiting first. On phones a table opens as a pushed screen with a Back button and focus on its title; from 768 px the table sits beside the map (split view). Sheets are bottom sheets on phones. Toasts are banners at the top, so they never cover the panel's buttons. Controls are at least 48 px; the main actions 56 px. One filled green button per group is the primary action; others are grey; red only removes something.
  4. **Kitchen board, dark by default**, readable at 1.5 m: 64 px table numbers, 26 px dish lines, a 36 px clock, 72 px actions (Start: light; Ready: green; Got it: red), and every header control at least 56 px with an icon and a label (End shift is icon-only below 1 280 px so the bar stays one row on a 1 024 px tablet). Columns are 1 : 1.3 : 0.9 from 1 024 px and 1 : 1.5 : 0.8 from 1 280 px. The busy dialog and the stop list are dark sheets too. The paper-slip perforation is gone. The kitchen root sets `color-scheme: dark` and a light focus ring (`.staff-dark`).
  5. **Motion only for state changes**: colours fade in 150–200 ms when a table or ticket changes state, a new ticket fades in over 200 ms, switches slide in 150 ms. The 900 ms "nudge" on a new order and the 420 ms slide-in are removed. Everything respects `prefers-reduced-motion` (the global rule).
  6. **Copy** changed only where it improves: the settle sheet's offline note now says closing the table needs a connection (it used to promise to record the payment later, which never happens); the English "Served" button is now "Mark served"; the legend is "Table states". New strings: tab names and the empty Orders and Calls lists.
- Consequences: UI only; no schema, RLS, function, route, realtime or outbox change. The kitchen e2e checks the late border as `rgb(208, 56, 74)` and waits for the 200 ms colour change to settle; the waiter's order-pad test uses its own table (9), because the bill-preference test seats a guest at table 4.

### ADR-055: Owner admin and platform page follow Apple's HIG, with small in-house shadcn-style parts and no new dependency

- Status: Accepted, 2026-11-17 (the owner's brief for `/admin`, onboarding and `/platform`; the rest are sensible calls under the Gate 5 delegation; free only, no new dependency)
- Decisions:
  1. **Same staff product as ADR-054.** The admin, `/admin/new`, `/signup`, `/login` and `/platform` use the neutral staff greys (`staff-bg`, `staff-fill`, `staff-sep`, `staff-label2`, `amber-text`) and direction A's green, amber and red, plus one new token: `staff-field` `#858c97` for field and control borders (3.4:1 on white). No theme presets, the UI font only (Google Sans; the serif display face is gone from these screens), Lucide icons only. Type follows the iOS scale: 34 px large title (28 px on phones), 20 px section headers, 17 px body, 15 px secondary, 13 px captions. Content is grouped in white 16 px-radius cards on the grey page. Buttons are at least 48 px tall (44 px for compact ones); one filled green button per group is the main action, grey for the rest, red tint only for what removes something. Status is always icon + word + colour.
  2. **Navigation.** From 1 024 px a 256 px sidebar with an icon per section; the current one is tinted and bold. Below 1 024 px a compact bar with the café name and, under it, a sticky row of the same sections as pills that scrolls sideways (the current one is centred). Every section stays one tap away and the row keeps the landmark name the tests use. The admin home lists the sections as large shortcuts under the plan banner.
  3. **shadcn/ui-style parts, written here, no packages.** `src/features/admin-ui/`: `Sheet` on the native `<dialog>` (bottom sheet on phones, right-edge panel from 768 px; focus moves in, Escape closes, the page behind is inert), `Tabs` (ARIA tabs with arrow keys; used on the photo import review below 1 024 px: Dishes · Photos), a data table style (staff, export, platform cafés), Sonner-style toasts (`ToastProvider`, `useToast`; confirmations only, errors stay inline next to the field), `AdminPage`, `Section`, `Notice` and `AuthShell`. The sales chart stays plain HTML (no chart library): columns for the period and a dark line for the comparison, so the two series differ in shape, with the table underneath. Radix, Recharts and Sonner were not added: these parts are a few hundred lines in total, need no client JavaScript where the page is static, and add nothing to the license allowlist or `npm audit`.
  4. **Menu editor.** From 1 024 px: sections, dishes and the editor as an inspector column (stays open after saving, so a photo can be added). Below 1 024 px the editor is a `Sheet`; after a dish is saved it shrinks to a bar at the bottom (saved, add or change the photo, edit again, close) and the page gets room below the list. This fixes the e2e failure on the phone and tablet projects: the old editor below 1 024 px was a `fixed inset-0` panel that stayed open after saving and covered the list, so "+ Add dish" could never receive the click (Playwright: "subtree intercepts pointer events"). The test was not changed.
  5. **Motion.** Only state changes: sheets and toasts appear in 200 ms (slide up on phones, from the right on tablets), the inspector fades in 150 ms, progress bars move in 200 ms. The global `prefers-reduced-motion` rule cuts all of them to 1 ms.
  6. **Copy.** New strings only where the screens need them (table headers, the empty device list, the invite role label, "Copy the link", tab names on the import review, the dish editor's group titles, "Save the dish first. Then add a photo.", the onboarding hint, the home page's "Sections"); English in Simplified Technical English, Armenian checked with the hy-writer rules. Toasts confirm "table added", "link copied" and "look saved".
- Consequences: UI only; no schema, RLS, function, route, realtime or business-rule change. `appearance-form.tsx` (in `guest-theme`, but an admin form) changed only its admin controls; the guest-theme previews and tokens are untouched. A future dependency for these parts would need its own ADR.

### ADR-056: "Pure", the owner's reference look, for the whole platform

- Status: Accepted, 2026-11-18 (the owner sent a reference image, a neumorphic food-app shot, and said "use this for all platform"; the details are sensible calls under the Gate 5 delegation; free only, no new dependency, no migration)
- Decisions:
  1. **The look.** A cool light grey page (`#eceef1`), pure white cards floating on large, very soft shadows (`0 18px 40px -18px rgb(30 40 60 / .18), 0 2px 6px rgb(30 40 60 / .04)`) with no borders and 24–30 px radii; big, light serif titles (Stardom for Latin, which has one weight; Noto Serif Armenian at weight 300 for Armenian, from the variable font already loaded); small grey meta (`#5f6570`, 5.0:1 on the page); dishes on dark round plates (`#1e2126`, a rim highlight and a soft drop shadow; the photo sits inside, inset 7 %; without a photo, the initial in light serif); round white floating icon buttons; black (`#1b1d21`) for filled actions; one muted amber, `#e0a33a`, only as a fill (count badges, the current category tab, the order-panel quantity) with black text on it (7.6:1), and `#8a5a00` where amber has to be text (prices, 5.1:1 on the page). No star ratings, favourites or "sort by popularity": we have no such data.
  2. **Guests: the existing "soft" preset becomes Pure.** The database check constraint allows only `evening`, `wine` and `soft`, and this change has no migration, so Pure is stored as `soft`; its label is «Մաքուր» / «Чистый» / "Pure", and the admin's look page offers it first, marked recommended (`THEME_CHOICES`, `RECOMMENDED_THEME` in `themes.ts`). Evening stays the code default for a café with no theme. New per-preset role tokens let a preset split roles off the accent without touching components: `--guest-badge`, `--guest-tab`, `--guest-tab-border`, `--guest-add` (the round "+" and the ✓), `--guest-add-shadow`, `--guest-field-edge`, `--guest-flourish`, and the plate's `--guest-dish`, `--guest-dish-rim`, `--guest-dish-well`, `--guest-dish-ink`, `--guest-dish-inset`. Evening and Wine map them back onto their old values, so they look as before. A brand colour also takes the badge and tab roles. Spark and fly-to-cart use the glow and badge colours (amber in Pure); reduced motion is unchanged.
  3. **Guest components.** `Plate` is now a grid of layers (no positioned children, so a caller's `absolute` always wins). The desktop order panel is a narrow column (13.5–14.5 rem): the title, each dish as a plate with a small × chip on top and a quantity badge, the total with the item count, and a round ✓ whose accessible name starts with "View order", as the old button did. The dish sheet is the expanded card: white, the plate bleeding off its top-right corner, a round × top-left, name, tags, description, a large price, round − / + steppers and the black "Add" button with the live price (kept as a clear button rather than the reference's quiet text link: it is the sheet's main action). The cart, the order status card and the games strip float as cards; the games strip stays dark, like the plates.
  4. **Staff screens in the same language** (supersedes the colour and type parts of ADR-054 and ADR-055; their HIG rules stay). `staff-bg` becomes `#eceef1`, `staff-fill` `#e3e6eb`, `staff-sep` `#dde0e6`, and `ink` `#1b1d21` everywhere. Every white `rounded-2xl` group inside `.admin-shell` / `.staff-shell` floats on `--shadow-soft` with a 24 px radius (one CSS rule, so the grouped cards keep their markup); new utilities `soft-card`, `soft-round` and `page-title` (the serif at weight 300). Buttons are pills; the primary one is black instead of green; secondary ones are white and floating. The sidebar is a floating white card and the current section a black pill. Green, amber and red keep their meanings (ready, new or hurry, calling or late) and every state is still icon + word + colour; the waiter's 48 px and the kitchen's 56 px / 72 px targets are unchanged.
  5. **The kitchen board is light.** Its components keep their token names; `.kitchen-light` maps the basalt and slip tokens onto the light palette (page, columns, white tickets with the soft shadow, ink text). Amber `#f2a23a` (8 min, black text 8.0:1) and red `#d0384a` (12 min, white text 4.8:1, 4.8:1 against a white ticket) are unchanged, as are the 64 px table numbers and 26 px lines; buttons that were light-on-dark are now black with white text. The light focus ring of the old dark board is replaced by the ink ring on all staff screens.
- Consequences: UI and tokens only; no schema, RLS, function or route change. The Fontshare request adds Switzer 300. A café on Wine or Evening sees no change beyond the dish sheet's and order panel's new layout.

### ADR-057: Owner insights: cost prices, menu engineering, busy hours and a working admin home

- Status: Accepted, 2026-11-19 (sensible calls under the Gate 5 delegation; free only, no new dependency; migration `20261119024332_menu_insights`)
- Decisions:
  1. **Cost price lives in its own owner-only table.** `item_costs (restaurant_id, item_id, cost)`, readable by owners through RLS and written only by `api.set_item_cost` (owner check, `null` clears it). Not a column on `items`, so it never reaches the guest snapshot, managers or menu queries, and editing it does not mark the menu as unpublished. The menu editor shows an optional "Cost price" field with the margin it leaves, for owners only, and saves it only when it changed.
  2. **Menu engineering (Kasavana and Smith), per section.** `api.menu_engineering(location, from, to)` (owner or manager, at most 93 days, accepted non-test orders): a dish is popular when its units sold reach 70 % of its section's average; it is profitable when its margin per unit reaches the section's sales-weighted average. The margin is price − cost only when every dish of the section has a cost (basis `margin`), otherwise the price (basis `price`), and the page says so with a link to add costs. Managers always get basis `price`. Quadrants are named in plain words, with one action each (keep and show first; try a small price rise; add a photo or feature; consider removing), never as stars, plowhorses, puzzles and dogs.
  3. **Busy hours.** `api.sales_heatmap(location, weeks)` returns average accepted orders per local ISO weekday and hour over the last 1–26 complete weeks. The page draws a 7 × open-hours HTML table in five ink strengths (no chart library, no colour legend needed), with the busiest and the quietest open hour as sentences and every cell's value in its text for screen readers.
  4. **Where it lives.** `/admin/dashboard/menu` (30 or 90 days, ending yesterday), linked from the sales page.
  5. **Admin home shows the café, not the sidebar again.** Today's revenue (with the change against the same time last week), orders and open tables from `api.sales_dashboard`, and a short to-do list built from RLS counts: menu never published or changed since publishing, no tables, no paired device, dishes without a photo, dishes sold out today. Each row links to the page where it is fixed. The eight shortcut cards with green icon tiles are gone; navigation stays in the sidebar and the phone pill row.
- Consequences: one migration with plain-Postgres tests (`supabase/tests/sql/menu_insights.sql`). Until CI applies it, the analysis page shows its error notice and the editor hides nothing (costs load empty); dish saves never call `set_item_cost` unless the cost was changed.

### ADR-058: Per-café brand profile on top of the guest theme

- Status: Accepted, 2026-11-19 (the owner approved the Blanca brand design; the details are sensible calls under the Gate 5 delegation; free only: Google Fonts and every listed family are free and SIL OFL 1.1, no new dependency)
- Decisions:
  1. **Storage.** `restaurants.brand jsonb` (null = no brand): `colors` (up to five `#rrggbb` roles: `header`, `accent`, `highlight`, `line`, `page`), `heading_font`, `body_font`, `script_font`, `plate` (`porcelain` | `dark` | `none`) and `wordmark` (a Storage path in the café's own folder, checked by the plain constraint `restaurants_brand_wordmark_scoped`). The round emblem stays `restaurants.logo_path`. Section covers use the existing `categories.image_path` (already scoped by `categories_image_path_scoped`), so no table and no storage rule were added.
  2. **Writes.** `api.set_brand(restaurant, brand)` and `api.set_section_cover(category, path)`, both `SECURITY DEFINER` with `search_path = ''`, for the owner or a manager (the same roles as `set_guest_appearance` and the menu-images folder), each with an `audit_log` row (`restaurant.brand`, `category.cover`). `set_brand` drops empty values, lowercases colours and refuses unknown keys, colours, fonts and plates (`private.brand_shape_ok`, `private.brand_fonts()`). The shape check is not a table constraint: a function in a check runs with the caller's rights on every update of the row, and owners update `logo_path` directly. Clients have no column grant on `brand`. A cover path must be `<café>/covers/<section>/<n>.webp`.
  3. **Reads.** `api.public_menu` returns `restaurant.brand` and `covers` (`{category_id: path}` for live sections). Covers are read live like the stop list, so a new cover needs no republish.
  4. **Tokens, not components.** `brandTokens()` (`guest-theme/brand.ts`) turns the brand into inline CSS variables on the guest root: header → the header band (`--brand-header`, `--brand-on-header`), filled buttons and large titles (3:1); accent → prices, small accent text and the current tab, only at 4.5:1 on the page and on cards; highlight → badges, the glow and the StarBorder star, the initial on an empty porcelain plate (3:1 on white, else the accent); line → hairlines and tab outlines as chosen, and chips (fills behind ink text) only where the ink keeps 4.5:1 and the dish initial 3:1, else a shade mixed towards the page that does (the editor warns); page → the page and dock, only when the theme's ink keeps 4.5:1 on it and the page is light or dark like the theme (the muted grey is re-mixed towards the ink until it keeps 4.5:1; a header colour used as accent text is re-checked against that page). A role that fails is ignored on the guest page, and the editor shows a warning for it. `data-plate`, `data-brand-header` and `data-brand-script` hook the plate styles, the header band and the script accent in `globals.css`. Without a brand the guest root gets exactly what it had before (unit-tested).
  5. **Fonts.** 27 curated Google families with Latin and Cyrillic (checked against the css2 API on 2026-11-19): serif and display faces for titles, sans faces for text, five scripts for one accent line (the rotating section name). Armenian is in none of them and falls through per glyph to Noto Serif Armenian or Noto Sans Armenian, which are self-hosted. One css2 request asks only for the chosen families and weights; it is preloaded and attached after hydration (`BrandFonts`), like Stardom, so a slow Google never blocks the menu. CSP adds `fonts.googleapis.com` (style, connect) and `fonts.gstatic.com` (font).
  6. **Editor.** `/admin/look` keeps the theme cards and the emblem, and adds the five colour roles (switch, picker, hex field, contrast ratio, warning), the wordmark upload (WebP up to 800 px wide), three font selects, the plate style and a live preview built from the same tokens. One Save writes the theme (the header colour also goes into the old `brand_color`) and the brand. Section covers (WebP, 1 200 px) are saved one by one as soon as they are uploaded or removed.
- Consequences: one migration (`20261119100000_brand_profile`) with its SQL test; until CI applies it, the admin page shows a notice, saves only the theme, and guests see no brand. The guest JS budget is unchanged for a café without a brand; with one, the font loader adds a few hundred bytes.

### ADR-059: Waiting-room games stay on plain canvas 2D, scale their resolution to the phone, and take the café's tokens

- Status: Accepted, 2026-11-19 (sensible calls under the Gate 5 delegation; free only, no new dependency). Numbered by lane in alphabetical order at the arena merge (ADR-062 explains).
- Decisions:
  1. **No game engine.** Each game is 20–27 KB minified (9–11 KB gzipped, art included: everything is drawn in code, no sprite files), loaded with `import()` only when the guest presses Start, never in the menu or status bundle. Phaser or PixiJS would add 300 KB to 1 MB for features the five games don't use. The card pictures in `public/games/` are 8–17 KB WebP frames captured from real play (`scripts/game-thumbs.mjs`).
  2. **Frame rate before pixels.** `loop()` averages frame times over 45 frames and, while a phone can't hold about 40 fps, steps the canvas from 2x to 1.5x to 1x (`fitCanvas`, `DPR_STEPS`). Measured on the harness at 6x CPU throttling (software canvas): Waiter Run 61 → 29 ms per frame, Kitchen Clash 270 → 42 ms. A hidden tab cancels the loop and it resumes without a jump.
  3. **No `ctx.filter`.** Software canvases and many low-end GPUs apply it to every draw call; Kitchen Clash's white hit flash froze frames for 100–200 ms. Flashes and tints are done by shifting gradient stops or colours.
  4. **No emoji or font glyphs as art or icons.** The intro shows the game's own picture, the "order ready" banner a Lucide bell, the pad its drawn shapes. Rules name the keys in words.
  5. **Café identity through tokens only.** The panel and game layer use the guest `--guest-deep*` tokens (each preset sets them); Start and Play again use `deep-accent`; the game receives the café's `--guest-deep-accent` (made for dark surfaces; `--guest-accent` is near-black on some presets) as `api.accent` for the few accents it draws (a pressed pad button). The game art itself stays the same for every café.
  6. **The wait stays visible.** While the order cooks, the game header says so under the title; when it turns ready, the banner covers and pauses the game (unchanged).
- Not done: a "table best" shared between phones at one table needs a server table and RLS; it waits for a reason beyond fun. A pass-the-phone two-player mode for Kitchen Clash is a later idea.
- Consequences: UI only; no schema, RLS, function or route change. New e2e spec `tests/e2e/games.spec.ts` and an axe screen `guest-game`; unit tests in `src/features/games/engine.test.ts`.

### ADR-060: Guest features from the café's own data: allergens, repeat orders, even split, pairings and the usual wait

- Status: Accepted, 2026-11-19 (arena guest lane; sensible calls under the Gate 5 delegation; free only, no new dependency)
- Decisions:
  1. **Allergens are the café's word, never a promise.** The dish sheet lists `items.allergens` (the 14 EU codes) or says none are listed; the "Allergies" filter (shown only when some dish lists allergens) marks dishes that contain what the guest avoids and dishes without data ("Ask your waiter"). It never hides a dish and never calls one safe. The choice is kept on the phone (`localStorage`) for every café. Diet tags gain vegetarian, gluten-free and lactose-free. The admin allergen field belongs to the admin editor.
  2. **Printed-menu rows where there are no photos.** A section where fewer than half the dishes have photos is a text list (name, portion, description, price, "+"), led by its featured photo; plates stay where there is food to show. Empty plates no longer carry the dish's initial.
  3. **Less decoration.** The rotating section word and the React Bits StarBorder (MIT + Commons Clause, not on our licence list) are gone from guest pages; main actions are plain accent pills with one sweep of light when they first become possible (own CSS, transform/opacity, none under reduced motion). The "scan the QR code" notice is an info card, not an alert.
  4. **Repeat and "last time here" stay on the phone.** "Order the same again" on a round puts its dishes back in this table's cart; the menu offers the phone's last order at this café (ids and quantities only, 120 days) when the cart is empty, limited to what today's menu can take. No account, no server data.
  5. **Even split is arithmetic.** The bill chooser shows each person's share, rounded up to 10 dram so the shares cover the bill. No payment integration; the waiter still brings one bill.
  6. **Pairings and the usual wait come from the café's own rounds** (`api.public_menu_hints`, migration `20261119014814_guest_hints`): up to two dishes from another section ordered in the same round at least 3 times in 60 days ("Often ordered with this"), and a 5-minute range from sending to "ready" (median to 80th percentile; the last 3 hours with 5 rounds, else 30 days with 10). Aggregates only, read without a session like `api.public_menu`. No AI and no owner set-up; an owner-picked pairing can come later. The wait is a range, never a countdown; well past it the page says "Taking longer than usual" and points to the waiter. The kitchen's own "busy" wait wins. Both are optional: until the migration is applied, or on any error, the guest pages look as before (the server waits at most 2 s).
  7. **Skipped:** favourites (the repeat order covers regulars without another icon on every card), tipping prompts, AI recommendations, calorie counts, course timing (needs an order field and the kitchen ticket; left for the kitchen lane).
- Consequences: one migration with an SQL test (`supabase/tests/sql/guest_hints.sql`); `rls_coverage.sql` lists the new anon function. Guest JS stays inside the budget: the allergy chooser and "last time here" load only when needed; hints are server-rendered props.

### ADR-061: Arena merge: one guest UI, brand tokens on top, and what came over from the second guest lane

- Status: Accepted, 2026-11-19 (integration of the parallel arena lanes; sensible calls under the Gate 5 delegation; free only, no new dependency)
- Decisions:
  1. **One guest UI.** Two guest lanes built competing versions; guest lane A (ADR-060) is merged, lane B is not. The brand profile (ADR-058) drives A's pages through the same `--guest-*` and `--brand-*` tokens, so no café's look lives in a component.
  2. **The script accent moves to section titles.** Lane A removed the rotating section word under the café's name, which was the only place the brand's script font appeared. The script font now sets the section titles (`.guest-flourish` on the `h2`), and only when the café chose one. Script letters join, so inside these titles Split Text's letters stay inline and fade in without rising (a transform needs inline-block, which breaks the join). The editor hint says "For section titles".
  3. **Grafted from lane B, small and safe:** the bottom bar widens to 620 px from 640 px screens when it holds four items, so labels are not cut; the two-column printed-menu lists are a grid filled row by row, with the hairline on top of each row after the first, so no column ends on a stray rule; cart lines without a photo read as receipt lines with no empty plate; the status page's earlier-order label is muted ink and its links use the café's accent text, and the bad-QR page uses the Pure palette, so the old tarragon green is left only for the done ticks; the guest search field's edge is the full `--guest-line-strong` (3:1 and up) instead of half of it; the dead `initial` field of the fly-to-cart plate is gone, since empty plates no longer carry letters.
  4. **Not grafted:** B's 60 % dimming of dishes that contain an avoided allergen (it also dimmed the warning; A marks the dish and keeps the warning at full contrast), and B's allergen wording (A's dish sheet already says "tell your waiter" on every dish and "ask your waiter" when allergens are not listed).
  5. **Games take the dark-surface accent.** The pad's pressed ring uses `--guest-deep-accent`, not `--guest-accent`, which is near-black on the default preset and vanished on the dark pad.
- Consequences: UI only. The three arena migrations (`20261119014814_guest_hints`, `20261119024332_menu_insights`, `20261119100000_brand_profile`) reach `restaurant-os-dev` through the CI `migrate` job after this push; until then the guest hints, menu analysis and brand stay hidden or show their notices, as each ADR describes.

### ADR-062: Kitchen board arena pass: allergy banner, all-day counts, item-level bump, per-screen sound, visible edges

- Status: Accepted, 2026-11-19 (arena lane "kitchen"; sensible calls under the Gate 5 delegation; free only, no new dependency, no migration). Numbered 062, not 057: every arena lane started from ADR-056 and took 057, so the lanes are numbered in alphabetical order (admin 057, brand 058, games 059, guest-a 060, kitchen 062, waiter 063) to merge without a clash.
- Decisions:
  1. **Allergy notes are loud.** `mentionsAllergy()` in `board-model.ts` matches allergy and intolerance stems in Armenian, Russian and English at the start of a word (`ալերգ`, `անհանդուրժ`, `аллерг`, `непереносим`, `allerg`, `intoleran`, gluten, lactose, coeliac and so on; "minute" does not match). Nuts are also an ordinary wish («ընկույզով», "extra nuts"), so a nut word (`ընկույզ`, `գետնանուշ`, `орех`, `арахис`, nut, peanut, walnut, hazelnut) counts only right after a "without / no" word, with at most two words between and no comma («առանց ընկույզի», «без грецких орехов», "no peanuts"), or before "-free" ("nut-free"); "extra nuts", «Побольше орехов», "nutmeg" and "donut" stay ordinary notes. A missed allergy costs more than a false alarm, so explicit allergy and intolerance words always count. A ticket whose order note or a still-wanted line note matches gets a red banner under its head band (`ShieldAlert` + «Ալերգիա․ կարդացեք նշումը»), and the note itself is red-edged with a shield instead of the amber speech chip. A plain wish ("no onion") stays an ordinary note. The guest's allergen filter is not sent with the order yet: that needs a `place_order` change and a migration, so it waits; the keyword match covers what guests and waiters type today.
  2. **Sounds per event and per screen**, generated with WebAudio oscillators (no audio files): new order two short beeps, cancellation a falling pair, allergy order a fast four-beep alarm. One sound per refresh, the most urgent one. Each screen picks a pitch (high, middle, low) on the start-shift overlay, stored in `localStorage` per station, so two tablets side by side are told apart by ear.
  3. **All day.** A strip under the header (`all-day.tsx`) totals each dish across order tickets in New and Cooking, biggest batch first, with option variants listed under the dish. Tapping a dish outlines the tickets that contain it. The strip folds away; each screen remembers that in `localStorage`. Pure client derivation (`allDay()`), unit-tested.
  4. **Item-level bump, local only.** In Cooking each line is a 56 px button; tapping it strikes the line and turns its quantity box green. When every wanted line is struck, the ticket moves to Ready through the existing `set_ticket_status` action (outbox, compare-and-set). Strikes live in `sessionStorage` on that one screen and are pruned when the ticket leaves Cooking; two screens on the same station do not share them (the ticket status itself is shared as before). Persisting per-line state for the waiter (a column, a `SECURITY DEFINER` function, an outbox kind and an SQL test) waits until a pilot café asks for it.
  5. **Colours on the light board** (re-measured against ADR-056): the board has one red, `#b0213a` (white on it 6.7:1), for the late band, the allergy banner and the cancellation button; the hurry border is `apricot-deep` `#c9780f` (3.0:1 on white); the on-time band is `#dde0e6` and an on-time ticket has a `#c4c9d1` frame, so it is visible at 1.5 m; white header controls get a 2 px `staff-field` inner edge (3.4:1) instead of floating unseen on the near-white bar (1.07:1); the dark-era hover brightening no longer applies inside `.kitchen-light`. The note chip uses a token (`--kds-note`), with an icon so colour is never alone. «Շտապել» became «Շտապ»; the kiosk source is «Տերմինալ» / «Терминал» / "Terminal" on the board (the waiter's key is the waiter lane's).
  6. **Timers past 99 minutes show hours** («38 ժ»), so a forgotten ticket does not print «2290 ր».
- Consequences: UI only; no schema, RLS, function, route or realtime change. The kitchen e2e checks the hurry border as `rgb(201, 120, 15)` and the late border as `rgb(176, 33, 58)`, and has a new test for the allergy banner and sound, the all-day counts and the item-level bump.

### ADR-063: Waiter app keeps in touch with the table: timeline, quiet cue, quick actions, a visible outbox and «Իմ հերթափոխը»

- Status: Accepted, 2026-11-19 (scout findings for the waiter lane; sensible calls under the Gate 5 delegation; free only, no new dependency, no migration). Numbered by lane in alphabetical order at the arena merge (ADR-062 explains).
- Decisions:
  1. **Table timeline.** The panel lists the table's moments oldest first («Ինչ է եղել»): guests sat down, each round, a staff accept, food ready and served per station, an open call, an open bill request. The floor read adds `orders.accepted_at, accepted_by` and `kitchen_tickets.ready_at, served_at` (columns from the baseline; RLS unchanged). An accept is a moment only when a staff member accepted a guest's order (`accepted_by` set, source not `waiter`); auto-accepts and a waiter's own orders are one moment. Answered calls are not fetched, so they are not on the list rather than invented.
  2. **Ages on the map.** A tile shows how long its most urgent thing has waited (ready counts from `ready_at`, not from the order). A seated table with no new moment for 20 minutes (`QUIET_MINUTES`) shows «լուռ է …» in amber text and the panel says it is worth a look: with QR ordering the risk is that nobody walks over. Times from 60 minutes read as hours and minutes.
  3. **Quick actions** in the Orders and Calls tabs (not a long-press on the map: a gesture nobody discovers): «Գնում եմ» for a call, «Նշել մատուցված» for all ready food of the table, «Ընդունել» for a single new order, «Փակել հաշիվը» opening the settle sheet. Each only when it can't be the wrong thing (`quickAction()` in `floor-model.ts`, unit-tested): no quick accept for a possible repeat, two new rounds or a party waiting for the old bill; no quick close while an order waits. The row itself still opens the table.
  4. **The outbox is visible** until it is empty, online or not: a header chip «Չուղարկված՝ N» opens a sheet with each waiting tap, its table and the time it was saved, a "send now" (replay ignoring the backoff) and "remove" with a confirm (`Outbox.discard`; never the tap being sent), plus the last five sent. Tiles with a waiting tap get an amber dot. Settling and cancelling stay online-only (realtime.md).
  5. **«Իմ հերթափոխը»**: cash to hand over, card, total, tables closed, orders entered, guest orders accepted and the mean wait before accepting, for the current business day, read through RLS (`bills_read`, `payments_read`, `orders_read` already allow waiters). It counts bills by `bills.closed_by` (the member; `payments.recorded_by` holds the auth user id, so it is not used). Only the caller's own numbers, no comparison with colleagues (metrics.md: no leaderboards).
  6. **Colours after ADR-056.** Free tables are an empty dashed outline (`line-strong`, 3.1:1 on the grey); seated tables a white card with a full tarragon edge (5.6:1 on the grey, it was 1.9:1); new orders the amber fill with an `amber-text` edge; selected choices in the reject, cancel and settle sheets are black, not green. Green stays for ready, served and "everyone is looked after".
  7. **Deferred:** moving a party to another table and handing a table to a colleague need a `SECURITY DEFINER` function, an SQL test and guest-side handling of the moved session; they are not in this change.
- Consequences: UI and reads only; no schema, RLS or function change. `Outbox` gains `discard()`, the provider `retry()` and `discard()`. The waiter e2e covers the timeline, the shift sheet, a quick «Գնում եմ» and the outbox sheet.

### ADR-064: One lock order for an order's rows, and one owner sign-up per e2e run

- Status: Accepted, 2026-11-19 (platform, round 2; sensible calls under the Gate 5 delegation; free only, no new dependency).
- Context:
  1. `api.set_ticket_status` (kitchen moves a ticket) locked the ticket, and its status update then updated the order row through the `kitchen_tickets_sync_order` trigger: ticket, then order. `api.cancel_order_item` (waiter cancels a line) locked the line, then the order, then wrote the ticket: line, order, ticket. Run at the same moment on one order, each held what the other wanted and Postgres ended one with 40P01.
  2. A full browser run signed up a new owner for every café it needed: at least 51 sign-ups without the demo owner's password (as in CI) and about 78 with it, all from one address within minutes. Supabase Auth limits sign-ups and sign-ins per address (30 per 5 minutes by default), and the form's "sign up, /admin/new, create café" path was where runs failed.
- Decisions:
  1. **Lock order: order, then kitchen ticket, then order line.** Migration `20261119120000_ticket_lock_order` re-creates both functions. Each finds the order with a plain read (a ticket and a line never change their order), takes `orders … for update` first, then the ticket, then the line, and only then reads what it decides on. Checks, their sequence, error codes, `security definer`, `search_path = ''` and grants are unchanged. `api.accept_order` and `api.reject_order` already lock the order first. New functions that write an order's tickets or lines take the locks in this order.
  2. **Two stale reads close with it.** `cancel_order_item` chose between "cancel the ticket" and "send a void ticket" from a ticket status read without a lock; and two stations finishing at the same moment could each compute the order's kitchen status without seeing the other's ticket. Both are now serialised on the order row.
  3. **The SQL test proves the order with a second session.** `supabase/tests/sql/ticket_lock_order.sql` holds a row lock in one session and calls the function from another over `dblink` (contrib, in the `postgres:16` image CI uses; local socket, test database only). While the call waits, rows later in the order must be free (`for update nowait` succeeds) and rows earlier must be held. Then 16 simultaneous moves and cancellations must all succeed. Against the baseline functions the first check fails.
  4. **One owner for the whole e2e run.** `tests/e2e/global-setup.ts` signs up one owner; each worker signs in as that owner once (`run-owner.ts`) and gets the session both as a Supabase client and as the app's own cookies (written by `@supabase/ssr`, the client the server uses). Every test still creates its own new café (`createFreshCafe`, `createCafeWithMenu`) through `api.create_restaurant`; the browser is pointed at it with the `pativ-restaurant` cookie that `requireMember` already reads. No assertion was removed or loosened, and tests that need an empty menu or no tables still get them.
  5. **The sign-up form keeps one test per screen size.** `onboarding.spec.ts` "a new owner signs up, creates a café" is the only form sign-up. It waits up to 30 s for each step and, when the form shows the refusal, fills it in again once after 65 s. The "taken page address" test opens `/admin/new` as the run's owner. API sign-ups and sign-ins retry once after a 429 the same way.
  6. **Because one owner now owns many cafés,** test queries through the owner's session name their café (device members, kitchen tickets), and the owner's second screen in the kitchen test is opened with cookies instead of the sign-in form.
- Consequences:
  - Sign-ups per full run: 4 without the demo owner's password (1 in global setup + the onboarding test on phone, tablet and desktop), down from at least 51 (27 through the form in menu, import, tables, Telegram and dashboard tests, 6 in onboarding, 18 for guest cafés). With the password: at least 13, down from about 78: the same 4, plus the invited manager in `staff.spec.ts` (3) and a café-less newcomer per worker in the a11y and overflow worlds (6); these test sign-up or need a person without a café. Counts are for one worker per screen size; each extra or restarted worker used to add sign-ups and now adds one sign-in.
  - Not changed, and a possible next limit: every guest who orders or calls a waiter is an anonymous Auth user (`signInAnonymously`), which Supabase limits per address too (30 an hour by default). A full run from one address makes several dozen.
  - A moved ticket and a cancelled line of the same order now wait for each other for the length of one short transaction instead of one of them failing. Staff clients need no change.
  - The migration reaches `restaurant-os-dev` through the CI `migrate` job after the push. Until then the cloud database still has the old functions, so the browser tests cannot show the fix; the SQL test does.
  - A worker's session lasts one hour (the Auth default). A single worker process that runs longer than that would need a new sign-in; no run comes close today (CI stops at 20 minutes).
  - The run's owner sees every café of the run through RLS, so a test that forgets to name its café could touch another test's rows. `TestCafe` no longer carries an email and password, which makes signing in "as this café's owner" a compile error.

### ADR-065: A second wordmark for dark backgrounds, Mrs Saint Delafield, and the effects are our own code

- Status: Accepted, 2026-11-19 (brand, round 2; sensible calls under the Gate 5 delegation; free only, no new dependency).
- Context:
  1. A café had one wordmark picture. Blanca's is drawn in dark ink, and its header band is dark brown, so the name was hard to read at the top of the menu. The slim bar that stays while the menu scrolls showed the café's name as text, cut off when it was long, even when the café had a wordmark.
  2. The owner asked for the script font Mrs Saint Delafield.
  3. ADR-052 allowed only code under permissive licences. Four effect files said "after React Bits (MIT + Commons Clause)", and StarBorder said "adapted from". Commons Clause is not on our licence list, so each file had to be either provably our own or gone.
- Decisions:
  1. **Two wordmark slots.** `restaurants.brand` keeps `wordmark` (artwork for light backgrounds, so everything saved before still works) and gains `wordmark_dark` (light artwork for dark backgrounds). Migration `20261119203419_brand_wordmark_dark` adds the key to `private.brand_shape_ok` and a second table constraint, `restaurants_brand_wordmark_dark_scoped`, that keeps the path in the café's own folder. `api.set_brand` and `api.public_menu` pass the object through and are unchanged.
  2. **The page picks by what is behind the picture.** `pickWordmark(brand, background)` in `brand.ts` takes the dark-background picture when white reads better than black on that colour (WCAG contrast, the same test the brand tokens use), else the light-background one, and falls back to the only picture there is. The header band's background is the brand's header colour, or the page when there is none; the slim bar's is the page (the brand's page colour if the theme accepts it, else the theme's). The server works this out (`wordmarkTones`) and hands the guest's client code two paths, so `brand.ts` stays out of the guest bundle.
  3. **The slim bar shows the wordmark** (40 px high, the café's name as its `alt`) when the café has one, and the name as text otherwise.
  4. **The editor has both slots side by side,** each previewed on the kind of background it is for: the café's own page or header colour when that is light (dark), else a plain light (dark) chip. The preview uses the same pick as the guest page.
  5. **Before the migration reaches a database,** reads work as before: a brand without `wordmark_dark` parses to "no dark wordmark" and the one picture is used everywhere. Saving a brand that has a dark wordmark or the new font is refused by the old `brand_shape_ok` and the editor shows its usual "could not save"; nothing is half-saved.
  6. **Mrs Saint Delafield** joins the script fonts (28 families now) in `BRAND_FONTS` and `private.brand_fonts()`. It is SIL OFL 1.1 and, unlike the rest of the list, Latin only (checked against the css2 API on 2026-11-19: `latin`, `latin-ext`, weight 400). Russian and Armenian section titles fall back per glyph to the serif stack, as Armenian already does for every script font; the editor says so under the script field. `brand.test.ts` now compares the list with the newest migration that defines `private.brand_fonts()`. Loading is unchanged: one css2 stylesheet added after first paint; `fonts.googleapis.com` and `fonts.gstatic.com` were already in the CSP.
  7. **Unused effect files are deleted:** `star-border.tsx`, `star-border.module.css`, `themed-star-border.tsx` (the one file marked "adapted from React Bits") and `motion/rotating-text.tsx` with its CSS. Nothing imported them since ADR-061. The `--guest-star` tokens stay: the tap spark and the ready-order ring light use them.
  8. **The three effects in use are our own implementations.** `motion/tilt.ts`, `motion/split-text.tsx` and `motion/spark.ts` (with `burst.ts`) were read side by side with the React Bits sources of the same names (repository `DavidHDev/react-bits`, `src/ts-default`, as published on 2026-11-19). They share the idea and nothing else. Upstream Tilted Card is a React component with its own spring integrator in a frame loop, a flip side, a caption and `--tc-*` variables; ours is a hook that calls Motion's `animate()` with a spring and sets `data-tilt` and `--glare-x/y`. Upstream Split Text uses GSAP's SplitText and ScrollTrigger; ours splits by grapheme with `Intl.Segmenter`, plays in CSS at load and with an `IntersectionObserver` and Motion below the fold. Upstream Click Spark draws on a canvas; ours animates a dozen spans with Motion. Two default numbers coincide in the tilt (12 degrees, 800 px perspective); numbers of that kind are not code. So no code was rewritten: the file headers now say what the files are (our implementation of a common idea the owner picked from that gallery, no code copied) instead of "after React Bits (MIT + Commons Clause)".
- Consequences:
  - Blanca needs its cream wordmark uploaded in the second slot by the owner (or a tester through the editor) once the migration is applied; no data was changed by hand.
  - A café that uploads only a dark-background picture gets it on light backgrounds too, where it may be hard to read; the editor's two chips show this before saving.
  - The comparison in 8 was made against today's upstream. If React Bits published a different version on 17 Nov 2026 (when ours was written), that version was not read; our files' structure (Motion mini, CSS keyframes, spans) follows from ADR-052's own engine choice, which upstream has never used.
  - The slim bar loads one more small picture when the two bars need different wordmarks.

### ADR-066: Owner sets allergens in the dish editor, dates read dd.mm.yyyy, and old test orders can be left out of the dashboard

- Status: Accepted, 2026-11-20 (owner admin, round 2; sensible calls under the Gate 5 delegation; free only, no new dependency).
- Context:
  1. Guests see allergens and use an "I avoid…" filter, but `api.save_item` did not take `allergens`, so only seed data had any. It also took any tag text, and the guest menu shows seven tags while the editor offered four.
  2. A demo café's dashboard counted its old test orders. Every dashboard, metrics, insights and export query already leaves out `orders.is_test`, but nothing could set it.
  3. A native date input shows the browser's order, not the dd.mm.yyyy that Armenian and Russian readers expect. The other admin dates already go through `formatDate`.
- Decisions:
  1. **`save_item` takes `allergens`** (migration `20261120090000_dish_allergens`, same signature, grants unchanged). A missing key keeps the stored list, so an older client or an import doesn't wipe it; an empty list clears it. Allergens must be among the 14 EU values and tags among the seven the guest menu knows (`invalid_allergen`, `invalid_tag`). The editor gets a second row of toggle buttons for allergens (labels reused from `guest.allergens`) and the three missing diet tags (vegetarian, gluten-free, lactose-free). An empty list still means "not filled in", never "free of allergens" (the guest menu already says so).
  2. **Test data is a flag on a range of days, not a start date.** `api.set_orders_test(location, from, to, is_test)` (owner or manager, audit-logged, up to 366 days, migration `20261120090100_orders_test_flag`) flips `is_test` for the orders of those business days. A start date would have needed a new setting read by five functions; the flag reuses the `not is_test` rule they already have, also fixes the export and metrics, and can be undone. The dashboard has a collapsed "Test orders" panel under the numbers, with a confirm step, acting on the range being shown.
  3. **Dates:** on the dashboard range form, hy and ru get a text field that shows and reads dd.mm.yyyy (`parseDateInput` also accepts `/`, `-`, short days and ISO, so the plain GET form still works without JS); en keeps the native date picker. The server turns the text into ISO before `resolveRange`.
- Consequences:
  - Existing dishes have no allergens until the owner fills them in; the guest filter keeps marking them "ask the waiter".
  - Flagging is by business day, so a café that wants to keep today's real orders must leave today out of the range.
  - The one-off flagging of Blanca's and the demo café's old orders is left to their owners, through the panel; no data was changed by hand.
