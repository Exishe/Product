# Realtime and offline behaviour

Targets from the brief: the kitchen sees a new order within 2 seconds, the waiter sees "ready", and the guest watches the status change, all on café Wi-Fi that drops.

## How changes reach screens

We use Broadcast from the database. Triggers on `orders`, `kitchen_tickets`, `service_requests` and `table_sessions` call `realtime.send(payload, event, topic, private => true)` inside the same transaction that changed the row. Supabase delivers the message after commit, so a screen never hears about an order that later rolled back.

We rejected Postgres Changes. Supabase's own docs say it "authorizes every event against each subscriber" and runs on a single thread, and they recommend Broadcast "for scalability and security". Broadcast also lets us send a small, deliberate payload instead of whole rows.

### Channels

| Topic | Who may join | Events | Payload |
|---|---|---|---|
| `loc:<location_id>` | Active staff of that location (`private.my_location_ids()`) | `order`, `ticket`, `service_request`, `table` | Ids and statuses only, for example `{id, order_id, station_id, kind, status}` |
| `guest:<guest_session_id>` | The anonymous user who owns that guest session | `order`, `service_request` | `{id, number, display_status}` |

Access is decided by RLS policies on `realtime.messages` (Supabase Realtime Authorization), checked when a client joins. Clients have no insert policy, so nobody can broadcast fake orders to a kitchen. The smoke test checks that a guest can't join the staff channel and that another café's owner can't either.

The "Allow public access" setting in Supabase Realtime is switched off, so only private channels exist.

### Messages are hints

Clients treat a message as "something changed here", not as the source of truth:

1. On join (`SUBSCRIBED`), fetch the full current state: open tickets for this station, the floor map for the waiter, the guest's orders.
2. On a message, patch the cached row from the payload for an instant update, then refetch that entity. TanStack Query invalidation, debounced by 300 ms so a burst becomes one request.
3. On reconnect, refetch everything; never try to replay the gap. (Supabase now offers Broadcast replay, up to 25 messages within 72 hours, but a full refetch is simpler and already correct.)
4. A safety poll every 15 s on the kitchen screen and waiter app, and every 10 s on a guest page with an order in progress. Each poll is one small indexed query, and it covers a dead socket the browser hasn't noticed.

### The 2-second budget

| Step | Expected | Notes |
|---|---|---|
| Guest taps "Order" → server action reaches Vercel `fra1` | 1 Yerevan–Frankfurt round trip | Not measured yet; measured in Phase 4 from a real café connection |
| Server checks token and JWT, calls `place_guest_order` | Tens of ms | Same region as the database |
| Commit → Realtime → kitchen tablet | Hundreds of ms | Includes Frankfurt → Yerevan |
| Kitchen refetches open tickets | 1 round trip | The card can already render from the hint payload before this finishes |

There's headroom on paper. Phase 6 adds an end-to-end Playwright test that times "guest taps Order" to "card visible on the kitchen board" and fails above 2 seconds.

### Kitchen screen details that matter

- A new ticket plays a short sound. Browsers block audio until the first tap, so the screen opens with a full-width "Tap to start" overlay (mosaic's "click anywhere to enable audio" banner, made impossible to miss).
- The Screen Wake Lock API keeps the tablet from sleeping. If the browser lacks it, the setup guide tells the owner to turn off auto-lock.
- A connection dot in the corner turns amber while reconnecting and red when offline, with the time of the last successful sync.
- Elapsed time per ticket ticks every second from the server's `created_at`, corrected by the clock offset measured at sync.

### Capacity

Supabase Realtime limits by plan: Free 200 concurrent connections, Pro 500, Pro without spend cap 10,000. A busy café at peak holds about 3–4 staff connections plus one per guest who is watching an order, so roughly 20–25. That means:

- About 20 cafés fit on Pro with default limits.
- Beyond that we either switch off the spend cap (10,000 connections) or move guests to polling: guest pages poll every 10 s and keep no socket. That cuts connections by about three quarters. We decide at about 15 cafés, with real numbers from the dashboard. `costs.md` (Phase 4) prices both options.

## Offline behaviour

Café Wi-Fi drops for seconds often and for minutes sometimes. Guests usually still have mobile data; staff devices usually don't. The design is server-authoritative with a small client outbox. That's the pattern nodedr and FloCafe use for status taps; neither has client-side sync, and neither do we.

### By device

| Device | Short drop (≤ 1 min) | Long outage (minutes) |
|---|---|---|
| Guest phone | The cart lives in `localStorage`. "Order" retries with the same idempotency key until it gets an answer; the button shows "Sending…". | If the phone has mobile data, nothing changes. Otherwise: "No connection. Your order is saved; call the waiter." The order is never sent twice: the key makes the retry safe. |
| Waiter app | Actions go to the outbox and replay automatically. The table map shows the last known state with an "offline" banner. | New orders, served taps and request acknowledgements keep queuing. Closing a table and taking payment is disabled offline with a clear message: money never sits in a queue. Fallback: paper pad, enter later. |
| Kitchen screen | Shows cached tickets; taps queue; timers keep running from local time. | Same. The waiter tells the kitchen about new paper orders directly. Phase 4 writes the paper fallback runbook. |
| Owner admin | Editing needs a connection; unsaved forms are kept in `localStorage` drafts. | — |

Phase 4 also recommends that every café keeps one phone with a mobile data plan as a hotspot for the kitchen screen and waiter tablet. Cheap, and it removes most long outages.

### The outbox

Waiter and kitchen PWAs keep an IndexedDB outbox. Each entry:

```ts
type OutboxEntry = {
  id: string;              // uuid, also the idempotency key where the API takes one
  action: 'place_waiter_order' | 'set_ticket_status' | 'accept_order' | 'reject_order'
        | 'acknowledge_void' | 'resolve_service_request';
  args: Record<string, unknown>;   // includes `expected` status for status changes
  createdAt: number;
  attempts: number;
  lastError?: string;
};
```

- Entries replay in order, one at a time, with backoff from 1 s to 30 s.
- Every queued action is safe to repeat. Orders carry an idempotency key, and status changes are compare-and-set with a "same move twice is fine" rule (`api.set_ticket_status`, `api.accept_order`, `api.reject_order` all return success on a repeat).
- If the database answers `stale_status` (someone else moved the ticket meanwhile), we drop the entry, refetch and show a short toast ("Table 5 was already served"). We never merge.
- If it answers `forbidden` (device deactivated), we stop replaying and show "This device was signed out".
- The UI shows the number of pending actions, and a per-card "waiting to send" mark.
- Never queued: settling a table, payments, publishing the menu, cancelling lines after they're served.

The service worker caches the app shell, the last published menu snapshot and fonts, so a staff device that reloads while offline still opens.

## Telegram delivery

Telegram is a side channel, so a Telegram outage must never slow down an order. The order transaction only inserts rows into `notification_outbox` (`private.enqueue_order_notification`).

1. A `pg_net` call fires after insert and pokes `POST /api/jobs/notify` with the job secret. Delivery normally takes a few seconds.
2. The endpoint claims due rows (`for update skip locked`) and sends them with grammY in the channel's language. It marks each row `sent`, or `failed` with the next attempt time (backoff 30 s, 1 min, 2 min … up to 1 hour).
3. `pg_cron` calls the same endpoint every minute to sweep anything missed. After 8 failed attempts a row becomes `dead` and shows up in the platform admin.
4. Two more cron jobs feed the same outbox: overdue alerts (tickets cooking longer than the location's threshold, default 20 minutes; one alert per ticket via `dedupe_key`) and the end-of-day summary at closing time.

Linking a chat: the owner presses "Connect Telegram" in the admin panel and gets a `t.me/<bot>?start=<code>` link. The bot's webhook receives `/start <code>`, checks the hashed one-time code and creates the `notification_channels` row.
