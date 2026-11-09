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
- Decision: Browsers query tables directly for reads. Plain forms (menu, floor, settings) write directly under RLS. Orders, tickets, sessions, bills and payments change only through `api.*` functions, which assert the caller's role at that location, and `private.*` functions for guest flows called by our server. Clients have no `INSERT/UPDATE/DELETE` grants on those tables.
- Rejected: all writes through Next.js server actions with the service role (RLS stops protecting writes, and one bug becomes a cross-tenant write); all writes as plain table updates under RLS (pricing, fan-out and transitions can't be expressed in policies).
- Consequences: The rules are tested in SQL (`90-smoke-test.sql`, then pgTAP or Vitest in CI). `SECURITY DEFINER` functions follow strict rules: `search_path = ''`, an explicit role assert, an explicit `revoke … from public, anon, authenticated`.

### ADR-005: Guests are Supabase anonymous users; guest writes go through our server

- Status: Proposed
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
- Consequences: Each café probably needs its own merchant contract. A platform or sub-merchant deal with one bank would simplify onboarding; that's a business question for Phase 5.

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
