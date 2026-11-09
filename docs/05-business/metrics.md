# Metrics

What we measure, how each number is computed from the Stage 1 schema, and the pilot targets. The pilot (`go-to-market.md`) replaces every assumption here with real numbers.

## The number we watch first

**Real orders per café per open day.** It counts what matters: guests and staff using the product during service. Revenue and retention follow from it, and a café that stops sending orders through the system is about to cancel, whatever it says.

- Real means the order reached the kitchen (`status = 'accepted'`; rejected and fully cancelled orders don't count) and isn't marked as a test (`orders.is_test`, design change 8 in `day-in-the-life.md`).
- An open day is a business day with at least one real order, so a closed Monday doesn't drag the average down.
- `costs.md` assumes about 50 orders a day for a typical 12-table café, of which about 60 % come by QR.

## Definitions

| Metric | Definition | Computed from | Pilot target |
|---|---|---|---|
| Orders per open day | Real orders per location per `business_date`, averaged over open days, split by `orders.source` (`qr`, `waiter`) | `orders` | 30 by week 4 |
| QR share | QR orders ÷ all real orders | `orders.source` | 50 % by week 4 |
| Average bill | Mean `bills.total` of paid bills, per location per week. Tips aren't on the bill in Stage 1 | `bills` where `status = 'paid'` | Measured, no target |
| Order to kitchen screen | Time from `orders.placed_at` until a kitchen screen first shows the ticket (`kitchen_tickets.first_seen_at`), for orders that go straight to the kitchen | `orders`, `kitchen_tickets` | p95 ≤ 2 s (`reliability.md`) |
| Waiter acceptance wait | `orders.accepted_at − placed_at` for orders that wait for the waiter (large, possible duplicate, or the café requires acceptance) | `orders` | p90 ≤ 2 min |
| Kitchen time | `kitchen_tickets.ready_at − created_at` per station; share of tickets over the café's limit (default 20 min) | `kitchen_tickets` | Measured, shown to the owner |
| First-week activation | A location is activated if, within 7 days of `restaurants.created_at`, it has a published menu, a paired kitchen screen, and 20 real orders on at least 3 different business days | `locations`, `members`, `orders` | 8 of the first 10 cafés |
| Time to first order | `restaurants.created_at` until the first real order | `restaurants`, `orders` | Median under 3 days |
| Trial conversion | Locations that pay after the free month ÷ locations whose free month ended | `subscriptions` | 60 % after the pilot |
| Logo churn | Paying locations cancelled in the month ÷ paying locations on the 1st | `subscriptions` | Under 3 % a month |
| Revenue churn | Monthly price lost to cancellations and downgrades ÷ monthly revenue on the 1st | `subscriptions.price_amd` | Under 3 % a month |
| Quiet café | A paying location with fewer than 5 real orders a day for 14 days in a row | `orders` | Each one gets a call within a week |
| AI import corrections | Share of AI-written menu rows the owner changed before publishing; price changes counted separately | `menu_imports`, translation `source` | Price changes under 2 % |
| Support load | Support chat threads and in-app reports per café per month; S1 incidents | Support log (`support.md`) | Under 2 per café after month 1 |

Quiet cafés matter more than churn in the first year. Churn is a lagging number: by the time a café cancels, the reason is weeks old. A drop in orders shows up the same week.

## Guest funnel (PostHog)

Tracked only at key moments, so the event volume stays inside the free tier (`costs.md`: about 15,000 events per café per month):

1. menu opened (with language)
2. dish added to the cart
3. order sent
4. status page viewed after the order

Two numbers come out of it: menu-to-order conversion per café, and the language mix (hy / ru / en). The language mix is our proof for tourists: a café that sees 30 % of its QR orders in English or Russian has a reason to keep paying that a paper menu can't match.

No phone numbers, names or device fingerprints go to PostHog. Stage 1 stores no guest personal data at all.

## Two example queries

Orders per open day and QR share for the last 28 days, per location:

```sql
select o.location_id,
       round(count(*)::numeric / count(distinct o.business_date), 1) as orders_per_open_day,
       round(100.0 * count(*) filter (where o.source = 'qr') / count(*), 0) as qr_share_pct
from public.orders o
where o.business_date >= current_date - 28
  and o.status = 'accepted'
  and not o.is_test
group by o.location_id;
```

Order to kitchen screen, p50 and p95, for orders that went straight to the kitchen:

```sql
select o.location_id,
       percentile_cont(0.5)  within group (order by extract(epoch from t.first_seen_at - o.placed_at)) as p50_s,
       percentile_cont(0.95) within group (order by extract(epoch from t.first_seen_at - o.placed_at)) as p95_s
from public.orders o
join public.kitchen_tickets t on t.order_id = o.id and t.kind = 'order'
where o.accepted_at = o.placed_at          -- accepted in the same transaction, so no waiter in between
  and not o.is_test
  and t.first_seen_at is not null
  and o.placed_at >= now() - interval '7 days'
group by o.location_id;
```

Orders that go straight to the kitchen are accepted inside the same transaction that places them, and `now()` is fixed for a transaction, so `accepted_at = placed_at` picks them out exactly. `first_seen_at` is server time when the kitchen screen confirms it has drawn the ticket, so the number includes the network back from the café. It slightly overstates the real delay, which is the safe direction.

## Schema additions for Phase 6

| Column | Why |
|---|---|
| `kitchen_tickets.first_seen_at` | The kitchen screen reports which tickets it has drawn (one small call per batch); without it we can't measure order to kitchen screen |
| `orders.is_test` | Already design change 8; keeps onboarding and training orders out of every metric |
| `subscriptions.canceled_at`, `cancel_reason` | Churn by month and why; the reason is picked from a short list plus free text |
| `subscriptions.converted_at` | When the free month turned into a paid plan |
| `members.last_seen_at` | Already planned for device heartbeats; also gives weekly active staff devices |

The `subscriptions.plan` values change with the pricing decision (`pricing.md`).

## Where the numbers live

- Platform admin: a `metrics_daily` table, one row per location per business day, filled by `pg_cron` at 05:30 Yerevan time, after the business day closes. Read through security-definer functions that only platform admins can call. Daily rows keep history even if orders are later archived.
- The owner sees their own orders per day, average bill and kitchen time on the dashboard and in the closing-time Telegram summary (`day-in-the-life.md`, 23:58).
- PostHog holds only the guest funnel; Sentry holds errors. Neither is a source for business numbers.

## Review rhythm

- During the pilot, weekly, per café, 15 minutes: orders per day, QR share, kitchen time, anything that broke. Notes go into the café's support chat so the owner sees them.
- Monthly from 10 cafés: activation, conversion, churn with reasons, quiet cafés, support load.

## What we don't measure yet

- Revenue uplift ("cafés sell 15 % more"). We'd need the café's sales before and after, and Stage 1 has no POS. Ask pilot owners for their HDM daily totals voluntarily; until then we make no such claim.
- Per-waiter performance. The brief lists it for the owner admin, but with 2–3 waiters and shared tablets the numbers would mislead. It comes with staff accounts in Stage 2.
