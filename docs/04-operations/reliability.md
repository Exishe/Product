# Reliability

What can go wrong, how likely it is, what we do about it, and the step-by-step runbook for the incidents that happen during service. `day-in-the-life.md` walks through most of these on a real evening.

## Targets

| Target | Value | How we know |
|---|---|---|
| New order visible on the kitchen screen | 95 % within 2 s | Playwright end-to-end timing test (Phase 6) and a timestamp comparison in production logs |
| Service available during opening hours (10:00–01:00 Yerevan) | 99.5 % per month, about 3.5 hours of total downtime | Uptime check every minute on a health endpoint |
| Lost orders | 0 | Every order is written before it's confirmed; retries are idempotent |
| Duplicate orders from retries | 0 | Idempotency keys, checked by the SQL smoke test |

The Supabase Free and Vercel Hobby plans come with no uptime guarantee. The 99.5 % target is ours, and moving the database to Supabase Pro is the first upgrade once cafés depend on it (`docs/02-stack/stack.md`).

## Risk register

Likelihood and impact are High, Medium or Low; the level follows the standard matrix (High × High = Critical). Status: Designed (in the docs and schema), Tested (proven by a test), Open (not yet handled).

| # | Risk | L | I | Level | Mitigation | Status |
|---|---|---|---|---|---|---|
| R1 | Café Wi-Fi drops during service | H | M | High | Staff outbox and cached screens; guests usually on mobile data; a hotspot phone for the kitchen tablet; red connection label after 15 s | Designed |
| R2 | Kitchen or waiter device dies (battery, broken, stolen) | M | H | High | Fixed charging stand; spare paired device; owner can open any screen from a phone; alert after 2 min offline; stolen devices revoked in one tap | Designed |
| R3 | Supabase outage | L | H | Medium | Paper fallback runbook (RB3); cached menu for guests; staff screens show last state | Designed |
| R4 | A deploy breaks the app | M | H | High | Preview deploys first, end-to-end tests before production, instant rollback (RB4), no deploys on Friday or Saturday evenings | Designed |
| R5 | Guest orders twice (retry or two phones) | H | M | High | Idempotency key per submission; possible-duplicate orders wait for the waiter | Retry: Tested; duplicate guard: Designed |
| R6 | Kitchen overloaded | H | M | High | Lateness colours, owner alert at 20 min, stop list, "kitchen busy" wait shown to guests | Designed |
| R7 | Cancellation not noticed in the kitchen | M | M | Medium | Void ticket stays until acknowledged; struck-through lines; comps need a manager | Tested |
| R8 | Two parties end up on one bill (table not closed) | M | M | Medium | Stale-table guard on new guest join; long-open tables highlighted | Designed |
| R9 | Remote or prank orders from a photographed QR | L | M | Low | Large orders wait for the waiter; reject in one tap; reprint QR kills the old one | Tested (QR version), Designed (rest) |
| R10 | Telegram messages delayed or lost | M | L | Low | Outbox with retries (1, 5, 15 min) and dead letters after 5 failures; web push as a second channel; the app, not Telegram, is the source of truth | Tested (harness), live test waits for the bot token |
| R11 | AI misreads a price and it reaches guests | H | H | Critical before mitigation, Low after | Publishing blocked until every AI-written row is reviewed (enforced in Postgres); uncertain prices flagged | Tested |
| R12 | AI provider down or free-tier limit hit | M | L | Low | Manual menu entry always available; drafts and photos kept; retry later | Designed |
| R13 | Data loss | L | H | Medium | Nightly encrypted dump on Free (RB5); daily backups on Pro; restore drill | Open: drill in Phase 6 |
| R14 | Leaked secret (service role key, QR signing key) | L | H | Medium | Secrets only in server env; rotation runbook (RB6); QR keys have key ids for gradual rotation | Designed |
| R15 | One café sees another café's data | L | H | Medium | RLS on every table, composite tenant keys, cross-tenant tests in CI | Tested (smoke test), CI in Phase 6 |
| R16 | Free-plan quota exceeded or project paused | M | M | Medium | Weekly usage check; upgrade triggers in `costs.md`; the live project gets daily traffic, so it isn't paused | Designed |
| R17 | Kitchen screen silent or asleep | M | M | Medium | "Start shift" tap unlocks sound and requests wake lock; setup guide disables auto-lock | Designed |
| R18 | Waiters forget to mark food served | H | L | Low | Ready tickets keep ageing on the waiter tablet; doesn't block closing the table | Accepted |
| R19 | Fiscal receipt rules (HDM) | L in Stage 1 | H | Medium | Stage 1 prints no receipts; the café keeps its HDM; tax advice before Stage 2 | Open (Stage 2) |
| R20 | Device clock wrong, so timers lie | L | L | Low | Timers use server time plus the offset measured at sync | Designed |

## How each action survives a bad connection

| Action | Who | Safe to repeat because | Queued offline? |
|---|---|---|---|
| Place order (guest) | Guest phone | Idempotency key; same key with a different body is refused | Kept on the phone, retried with the same key |
| Place order (waiter) | Waiter tablet | Idempotency key | Yes |
| Start cooking, ready, served | Kitchen, waiter | Compare-and-set; the same move twice succeeds silently | Yes |
| Accept or reject order | Waiter | Repeat of the same decision succeeds | Yes |
| Acknowledge cancellation | Kitchen | Setting `acknowledged_at` twice changes nothing | Yes |
| Close table and record payment | Waiter | Idempotency key on the bill | No, needs a connection |
| Publish menu | Owner | New version each time, by design | No |
| Cancel an item after it's served | Manager | Not repeated automatically | No |

## Runbooks

### RB1: Café Wi-Fi is down during service

Signs: red «Կապ չկա» label on the kitchen screen and the waiter tablet for more than 15 seconds.

1. Keep working. Staff screens keep the last state; taps and new waiter orders queue. Tell the kitchen the screen may be a few minutes behind for QR orders.
2. Kitchen tablet to the hotspot. Turn on the hotspot on the café's backup phone and switch the kitchen tablet to it in Settings → Wi-Fi.
   - Expected: the label goes green within 10 seconds and new slips appear with one beep.
   - If the phone has no data either, go to RB3.
3. Waiter tablet next, same hotspot.
4. Don't close tables while offline. The button is disabled; take payment as usual and close the table in the app once the connection is back.
5. Restart the router if it doesn't come back in 5 minutes. Most outages are the router.

Done when: every device's label is green and its "waiting actions" counter is 0.

### RB2: The kitchen screen is dead

Signs: black screen, or the owner gets «Խոհանոցի էկրանն անջատված է» in Telegram.

1. Plug it in with the fixed cable on the stand. If it starts, open the browser; the board reloads and catches up.
2. If it doesn't start in 2 minutes, take the spare device from the drawer. It's already paired as a second kitchen screen, so open it and tap «Սկսել հերթափոխը».
3. No spare: the owner (or a manager) signs in on any phone, opens the admin, goes to "Kitchen board" for that station and leaves the phone on the pass.
4. Stolen or broken beyond repair: the owner revokes it in Admin → Staff and devices → «Անջատել», then pairs a replacement.

Done when: a test order from the owner's phone appears on the replacement screen.

### RB3: The whole system is down (cloud outage, or no internet anywhere in the café)

Signs: every device red for more than 5 minutes, hotspot doesn't help, or our status message in the support Telegram channel says so.

1. Switch to paper.
   - Waiters write orders on the pads kept at the bar (onboarding leaves a pack) and read them to the kitchen and bar.
   - Put a «Պատվերներն ընդունում է մատուցողը» card on the tables with QR codes, or just tell guests.
2. Keep the paper slips in order with the table number and time.
3. When the system is back, let the queued staff actions sync first. Then close the tables that were opened before the outage.
4. Optional: enter the paper orders through the waiter order pad marked «Թղթից», so the day's sales report is complete. The kitchen will see them as already served; the waiter marks them served straight away.
5. We post in the support channel when the incident starts and ends, and write a short public note within 24 hours: what happened, how long, what we changed.

### RB4: A new version broke something

1. Roll back first, investigate later. Vercel → project → Deployments → previous production deployment → "Instant Rollback". Expected in under a minute.
2. If a database migration was part of the release: migrations are written to be backward compatible (add columns before using them, remove only in a later release), so the previous app version still works on the new schema. Never roll back a migration under pressure.
3. Reproduce the bug on a preview deploy, fix it, add a test that fails without the fix, and deploy again in the quiet hours (before 11:00).

### RB5: Restore the database from the nightly dump

Used for the drill in Phase 6 and in a real data loss.

1. Download the latest `db-backup` artifact from GitHub Actions (`.github/workflows/backup.yml`, see `backups.md`). If it is encrypted, decrypt it with the owner's `age` key: `age -d -i key.txt pativ-db-<date>.tar.gz.age | tar -xz`; you get `schema.sql`, `data.sql` and `auth-data.sql`.
2. Create a fresh Supabase project in the same region (never restore over the live one while it might still hold newer data).
3. Apply the dumps in order: `psql "$NEW_DB_URL" -f schema.sql -f auth-data.sql -f data.sql`.
4. Run `npm run test:db` against it and compare row counts of `orders` and `bills` for the last full day with the Telegram summary.
5. Point a preview deploy at the restored project and click through a test order. Switching production over is the owner's decision.
6. Record the time taken in the History table below. The target is under 60 minutes.

### RB6: A secret leaked

1. Service role key: in Supabase, rotate the secret key, update `SUPABASE_SECRET_KEY` in Vercel, redeploy. Check the logs for unknown use since the leak.
2. QR signing key:
   - Add a new key id in `QR_SIGNING_KEYS` and make it current.
   - Reprint cafés' QR cards over the next days; then remove the old key.
   - If the leak is serious, remove the old key at once, and every café reprints the same day.
3. Telegram bot token: revoke it in BotFather, set the new token, and re-register the webhook with a new secret.
4. AI provider key: revoke it in the provider console and set the new one.
5. Write down what leaked, when, how, and what changed so it can't happen again.

### History

| Date | Runbook | By | Notes |
|---|---|---|---|
| — | RB5 drill | — | Planned for Phase 6 |
