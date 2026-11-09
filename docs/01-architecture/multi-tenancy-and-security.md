# Multi-tenancy and security

Short version: every café's data is separated by Postgres Row Level Security, enforced in the database rather than in our code. Guests order without accounts, using a signed table QR plus a silent anonymous session. Every public entry point has a rate limit. The SQL behind each claim is in `sql/10-schema.sql` and checked by `sql/90-smoke-test.sql`.

## Tenancy model

- Tenant = restaurant. One owner (or a few) and a brand. It can have several locations; most Stage 1 customers will have one.
- Location = café = billing unit. Tables, stations, counters, the published menu and the subscription belong to a location.
- Shared schema, one database. Every tenant row carries `restaurant_id`. We rejected a schema per tenant and a database per tenant (see `decisions.md`, ADR-002).
- Three layers keep tenants apart:
  1. RLS policies on every table in `public` (68 of 68), built on helper functions that resolve the caller's memberships once per query.
  2. Composite foreign keys `(restaurant_id, parent_id)`, so even the service role can't write a row that points at another tenant's data.
  3. No client writes to operational tables: orders, tickets, bills and sessions change only through functions that assert the caller's role at that location.

## Roles

| Can… | Owner | Manager | Waiter | Kitchen | Cashier (S2) | Guest | Platform admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Edit menu, run AI import, publish | ✓ | ✓ | | | | | |
| Mark items sold out (stop list) | ✓ | ✓ | ✓ | ✓ | | | |
| Set up floor and stations, print QR codes | ✓ | ✓ | | | | | |
| Invite staff, pair devices | ✓ | ✓ (devices) | | | | | |
| See subscription | ✓ | | | | | | ✓ |
| See live orders and tables | ✓ | ✓ | ✓ | ✓ | ✓ | own orders | read |
| Take orders, accept or reject QR orders | ✓ | ✓ | ✓ | | | own orders | |
| Start cooking, mark ready, undo ready | ✓ | ✓ | | ✓ | | | |
| Mark served | ✓ | ✓ | ✓ | ✓ | | | |
| Cancel a line before it's served | ✓ | ✓ | ✓ | | | | |
| Cancel a line after it's served (comp) | ✓ | ✓ | | | | | |
| Close the table, record payment | ✓ | ✓ | ✓ | | ✓ | | |
| Sales dashboard, audit log, Telegram setup | ✓ | ✓ | | | | | read |

A member can be limited to some locations (`members.all_locations = false` plus `member_locations`).

## Accounts

- Owners and managers sign in with email (password or magic link) through Supabase Auth. TOTP MFA is offered and recommended for owners.
- Waiter tablets and kitchen screens are devices. The owner creates a pairing in the admin panel (role, location, label) and gets a 6-digit code valid for 10 minutes, stored hashed and usable once. On the device, `/pair` takes the code. The server then creates an auth user for the device (random credentials nobody sees), a `members` row with `kind = 'device'`, and a long-lived session. Stage 2 adds personal staff accounts with PIN switching on shared tablets, for per-waiter stats.
- Guests are Supabase anonymous users (`is_anonymous = true` in the JWT). They never see a sign-in screen.
- Revoking access works immediately. RLS helpers check `members.is_active` on every query, so deactivating a member or device cuts data access at once, even while its JWT is still valid. The server also signs the user out of all sessions to kill the refresh token.

## How RLS is built

Helper functions live in the `private` schema, which PostgREST doesn't expose. They are `SECURITY DEFINER` with `search_path = ''`, so they can read `members` without recursing into its own policy:

| Helper | Returns |
|---|---|
| `private.my_restaurant_ids(roles)` | Restaurants where the caller is an active member, optionally with one of `roles` |
| `private.my_location_ids(roles)` | Locations the caller may work at, respecting `all_locations` |
| `private.my_guest_session_ids()` | The caller's guest sessions |
| `private.is_platform_admin()` | Whether the caller is in `platform_admins` |
| `private.is_real_user()` | Signed in and not anonymous; every staff helper requires it |

Policies call them inside a sub-select, for example `using (location_id in (select private.my_location_ids()))`, so Postgres evaluates the helper once per statement instead of once per row (Supabase's RLS performance guidance). Child tables like `order_items` use `exists (select 1 from orders o where o.id = order_id)`; RLS on `orders` applies inside, so "visible if the parent is visible" holds by construction.

Rules we follow, several of them from mistakes the smoke test caught:

- RLS is enabled on every table in `public`. A Stage 2–4 table with no policy yet means no client access, not open access.
- Guests are anonymous users with the `authenticated` role, so every staff check goes through `private.is_real_user()`. A guest can never match a staff policy, even by accident. We never use `auth.role()`.
- Clients get `SELECT` on everything (RLS filters rows) and `INSERT/UPDATE/DELETE` only on menu, floor, stop-list and notification-channel tables. `restaurants` and `locations` get column-level `UPDATE` grants only for safe columns: an owner can't change `status` or `published_menu_version_id` from the browser.
- `SECURITY DEFINER` functions live in `api` (callable by signed-in users) or `private` (server and policies only). Each one starts by asserting the caller's role at the row's location.
- **Postgres grants `EXECUTE` on every new function to `PUBLIC`, and Supabase adds grants for `anon` and `authenticated` in `public`.** Per-schema default privileges can't remove the global `PUBLIC` grant. The smoke test caught a guest calling a server-only function because of exactly this. So every migration that creates functions ends with an explicit `revoke execute … from public, anon, authenticated`, followed by named grants.
- Views get `security_invoker = true`. We have none yet.
- `user_metadata` is never used for authorization. Roles come from `members`, not from the JWT.
- Supabase's security and performance advisors run in CI (Phase 2).

## Guests: ordering without an account

### The table QR

Each table's QR code points to `https://<domain>/t/<token>`. The token is 34 bytes, base64url-encoded to 46 characters:

| Bytes | Field |
|---|---|
| 1 | format version |
| 1 | key id (`kid`) |
| 16 | table id |
| 4 | `qr_version` of the table |
| 12 | HMAC-SHA256 over the fields above, truncated to 96 bits |

- The signing keys live only on the server (`QR_SIGNING_KEYS`, a map from key id to key). New prints use the current key id. To rotate a key, we add a new one, reprint at our own pace and retire the old key later.
- To kill one table's printed QR code (stolen sticker, abuse), the owner presses "Reprint QR". That bumps `tables.qr_version`; old stickers stop working at once and existing guest sessions for that table can't order.
- Verifying the token needs no database hit, so a bot spraying random URLs is rejected cheaply on the server.
- The URL is about 70 characters, which still fits a QR with high error correction and a café logo in the middle (qr-code-styling, Phase 3).

### The flow

1. Scan. The server verifies the signature and stores the token in an HttpOnly cookie for the guest page. Invalid token → a friendly "ask your waiter" page.
2. Browse. The menu renders from `api.public_menu` (published snapshot plus today's sold-out items), cached per location. No session is needed to look.
3. First action ("Order" or "Call waiter"). The browser solves an invisible Cloudflare Turnstile check and calls `signInAnonymously()`. The session persists in the browser, so a returning guest reuses it.
4. Server action. It re-verifies the table token and verifies the guest's JWT (`getClaims`). Then it calls `private.join_table(user, table, qr_version, locale)`, which opens or joins the table session and returns a guest session valid for 4 hours. Finally it calls `private.place_guest_order(user, guest_session, idempotency_key, lines, note)`.
5. Database. It checks that the session belongs to this user and is still valid, the QR version is current and ordering is enabled. It applies rate limits, prices every line from the published snapshot, applies the stop list, validates modifier groups, routes lines to stations and decides auto-accept or waiter acceptance.
6. Status. The guest reads their own orders through RLS and listens on `guest:<guest_session>`.

The server is trusted for exactly one thing: "this anonymous user is standing at this table", established by the QR signature. Everything else is checked in Postgres.

### What this does not stop

A static sticker can be photographed and used from outside the café. We accept that and limit the damage:

- Orders above 100,000 AMD (per location, configurable), or any order at a café that switches on "confirm QR orders", go to the waiter first and only reach the kitchen once accepted.
- The waiter app flags orders at tables marked empty on the floor map. One tap rejects them.
- Guest sessions end when the bill is settled, so a guest who left can't keep ordering on the next party's tab.
- "Reprint QR" kills a misused sticker.

Rotating codes on a screen and NFC would close the gap fully, but they cost hardware that our customers don't have. We'll revisit if abuse shows up in real cafés.

## Rate limits and abuse protection

| Where | What | Starting limit |
|---|---|---|
| Vercel Firewall | Requests per IP to `/t/*` and server actions | 120 per minute (plan check in Phase 2) |
| Server | Table token signature | Invalid tokens never reach the database |
| Cloudflare Turnstile | Before anonymous sign-in | Invisible challenge |
| Supabase Auth | Anonymous sign-ins per IP | Default is 30 per hour. **Raise to about 300**: all guests on café Wi-Fi share one IP, so the default would lock out a busy evening |
| Postgres | Joining a table, per guest | 20 per hour |
| Postgres | Orders per guest session | 6 per 10 minutes |
| Postgres | Orders per table | 30 per hour |
| Postgres | Order size | 30 lines, 20 per line, 300-character note, 200-character line note |
| Postgres | Auto-accept ceiling | 100,000 AMD; above it the waiter confirms |
| Postgres | "Call waiter" and "bill please" | One open request per table and kind (repeat taps collapse) |
| Server | AI menu import | 20 imports per restaurant per day, 8 photos each, 10 MB per photo |
| Server | Device pairing | 5 code attempts per IP per 10 minutes; codes live 10 minutes |
| Telegram webhook | Origin check | `X-Telegram-Bot-Api-Secret-Token` header must match |

The Postgres limits use a fixed-window counter in an unlogged table (`private.rate_limits`), cleaned nightly. It's cheap at our scale and needs no extra service. We'll add Redis only if the counters show up in slow-query logs.

## Other threats

| Threat | Mitigation |
|---|---|
| Price tampering by the guest | The client sends item ids, quantities and modifier ids only. Prices come from the published snapshot inside the database function. |
| Double submit on bad Wi-Fi | Idempotency key per order and per settlement. A replay returns the original; the same key with a different body is refused. |
| XSS through menu text (owners type it, guests see it) | React escapes text. Menu text is never rendered as HTML. A CSP with nonces is set in Phase 2. |
| Malicious image upload | Size limit and MIME allowlist (JPEG, PNG, WebP) set on the bucket. Photos are resized in the browser before upload and served through Supabase image transformation, never as raw user HTML or SVG. |
| Prompt injection through a menu photo | Claude gets no tools during import. Output must match a strict JSON schema validated by Zod, and the owner reviews every item before anything is published. The worst case is a wrong draft, not an action. |
| Stolen staff device | The owner deactivates the device in the admin panel. RLS denies immediately and sessions are revoked. |
| Leaked service role key | It exists only in Vercel server env vars and is used in two modules. Rotating it is a documented runbook (Phase 4). |
| Payment credentials (Stage 3) | Stored in Supabase Vault and referenced by id. Only server-side routes decrypt them. |
| Cross-tenant link through a bug | Composite foreign keys make it impossible at the database level. |
| Account takeover of an owner | MFA offered, email change requires confirmation, audit log of sensitive actions. |

## Secrets

| Secret | Lives in | Used by |
|---|---|---|
| Supabase publishable key | Client env (`NEXT_PUBLIC_…`) | Browser |
| Supabase service role key | Vercel server env | Guest-order module, background jobs |
| `QR_SIGNING_KEYS` | Vercel server env | QR generation and checking |
| Claude API key | Vercel server env | Menu import, translation |
| Telegram bot token, webhook secret | Vercel server env | Notification worker, webhook |
| Turnstile secret | Vercel server env | Anonymous sign-in check |
| Job endpoint secret | Vercel env and Supabase Vault | pg_net → `/api/jobs/*` |
| Payment provider credentials (S3) | Supabase Vault | Payment routes |

Nothing secret is committed. Local development uses `.env.local`, and the repo has `.env.example` (Phase 2).

## Data retention

- Anonymous guest users: deleted after 30 days with no orders, or after 180 days in any case. Their orders stay, with `guest_session_id` set to null.
- `private.rate_limits` rows: deleted after one day.
- Realtime messages: Supabase drops them after 3 days.
- Stage 1 stores no guest personal data. Stage 3 introduces customers (name, phone); before then we check Armenia's personal data law for what consent and retention it requires [verify before Stage 3].

## Tests that guard this

- `sql/90-smoke-test.sql` today. In Phase 6 it grows into an RLS test suite that runs in CI against a local Supabase, with one test per table per role. Each test covers what the role can read and write, and that café B sees nothing of café A.
- `supabase db advisors` in CI.
- semgrep and a dependency audit before every deploy (brief, section 2).
