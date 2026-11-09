# Costs per café

Monthly infrastructure and AI cost at 1, 10, 50 and 200 cafés. Prices were checked on 9 Nov 2026; the arithmetic is in [`cost-model.py`](cost-model.py), so the numbers can be re-run when prices or real usage change. Amounts in AMD use the Central Bank of Armenia rate of 9 Nov 2026: 1 USD = 360.43 AMD.

Not included: our own time (sales, onboarding, support), the café's devices, QR card stands, and marketing.

## Bottom line

| Cafés | Monthly cost | Per café | Share of revenue at 15,000 AMD per café |
|---|---|---|---|
| 1 (pilot, free plans) | $0 | 0 AMD | — |
| 1 (paid plans) | $46.68 = 16,825 AMD | 16,825 AMD | 112 % |
| 10 | $47.11 = 16,980 AMD | 1,698 AMD | 11.3 % |
| 50 | $114.15 = 41,143 AMD | 823 AMD | 5.5 % |
| 200 | $470.34 = 169,526 AMD | 848 AMD | 5.7 % |

- Fixed costs dominate early. About $45 a month (Supabase Pro + Vercel Pro) buys capacity for 20–30 cafés, so one café at 10,000–15,000 AMD doesn't cover it. Two paying cafés do, at any price in the brief's range.
- From 10 cafés, infrastructure is under 20 % of revenue even at the lowest price (10,000 AMD), and from 50 cafés it's around 5–8 %.
- AI isn't a cost driver. Even on Claude's most capable model a full menu import costs about $0.43, once per café.

## Free plans: how far they go

While the owner's "free only" rule holds (ADR-025), the pilot runs on Supabase Free, Vercel Hobby and Gemini's free tier, for $0.

| Limit | Free plan | One café uses | Runs out at |
|---|---|---|---|
| Database size | 500 MB | ~15 MB a month | ~3 cafés for 6 months, or 1 café for 2.5 years |
| Cached egress (dish photos) | 5 GB a month | ~1 GB | ~5 cafés |
| Realtime connections | 200 | ~17 at peak | ~11 cafés |
| Monthly active users | 50,000 | ~700 | ~70 cafés |
| Backups | None | — | Covered by our nightly encrypted dump |
| Commercial use (Vercel Hobby) | Not allowed | — | The first café that pays |

So the free setup carries a pilot of one to three cafés, but not a business. Before the first café pays, two things have to change: paid hosting (Vercel's terms) and, soon after, Supabase Pro for backups. That's the decision point for the owner; `docs/02-stack/stack.md` lists the upgrade order.

## Assumptions per café per month

A typical 12-table café; real numbers from the pilot replace these.

| Quantity | Value | Reasoning |
|---|---|---|
| Orders | 1,500 | ~50 a day: ~40 on weekdays, ~70 on Fridays and Saturdays |
| Guest phones signed in (MAU) | 700 | ~36 parties a day, ~60 % order by QR, ~1.2 phones per party, some regulars. Guests who only browse don't sign in. Anonymous users count as monthly active users: the docs don't say so explicitly, but they have user ids and refresh tokens, so we assume they do. |
| Peak Realtime connections | 17 | Kitchen, bar, waiter tablet, waiter phone, owner, plus ~12 guests watching an order on a Friday at 20:30. All cafés peak at the same time. |
| Realtime messages | 120,000 | ~20 broadcasts per order (placed, accepted, tickets, cooking, ready, served), each delivered to ~4 screens |
| Database growth | 15 MB | ~21 rows per order with tickets, history and outbox, plus indexes |
| Cached egress | 1 GB | Dish thumbnails resized to 600 px WebP on upload, ~1,600 menu views |
| Analytics events | 15,000 | Only key moments are tracked (menu opened, order sent, table closed), not every tap |
| New cafés per month | 20 % of the base | Drives menu imports |

## Unit prices

| Item | Price | Source |
|---|---|---|
| Supabase Pro | $25/month, includes $10 compute credit (a Micro instance), 100,000 MAU, 500 Realtime connections, 5 M Realtime messages, 8 GB disk, 250 GB cached + 250 GB uncached egress | [pricing](https://supabase.com/pricing), [MAU](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users) |
| Over quota | $0.00325 per MAU; $10 per 1,000 peak connections; $2.50 per 1 M messages; $0.125 per GB disk; $0.03 / $0.09 per GB cached / uncached egress | [Realtime connections](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-peak-connections), [messages](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages), [egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [disk](https://supabase.com/docs/guides/platform/manage-your-usage/disk-size) |
| Larger compute | Small about $15, Medium about $60 a month, minus the $10 credit | [compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute) |
| Going past 500 Realtime connections | Requires turning off the Pro spend cap | [Realtime limits](https://supabase.com/docs/guides/realtime/limits) |
| Vercel Pro | $20/month per developer seat, with $20 usage credit, 1 TB data transfer; invocations $0.60 per 1 M | [pricing](https://vercel.com/pricing), [fair use](https://vercel.com/docs/limits/fair-use-guidelines) |
| Sentry Team | $26/month billed yearly ($29 monthly), when more than one person needs access | [pricing](https://sentry.io/pricing/) |
| PostHog | Free to 1 M events, then $0.00005 per event | [pricing](https://posthog.com/pricing) |
| Resend Pro | $20/month for 50,000 emails, once we send from our own domain | [pricing](https://resend.com/pricing) |
| Domain | about $15 a year | — |
| Telegram Bot API, Cloudflare Turnstile | Free | — |

## AI menu import

One import reads about 4 photos of a 60-dish menu and then translates the result.

- Images: Claude counts one token per 28 × 28 pixel patch ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)). A 1600 × 1200 photo is 58 × 43 = 2,494 tokens, so 4 photos are about 10,000.
- Total per import: about 17,000 input tokens (photos, instructions, the draft for translation) and about 18,000 output tokens (structured dishes, three languages, reasoning).

| Model | Price per M tokens (in / out) | Cost per import |
|---|---|---|
| Gemini free tier (now) | $0 | $0; photos may be used by Google to improve its products |
| Claude Haiku 5.5 | $0.10 / $0.50 | about $0.01 |
| Claude Sonnet 5.5 | $2 / $10 | about $0.21 |
| Claude Opus 5.5 (default when paid is allowed) | $4 / $20 | about $0.43 |
| Gemini 3.8 Flash (paid) | $0.75 / $3.75 until 31 Dec 2026, then $1.50 / $7.50 | about $0.08, then $0.16 |

Prices: [Claude](https://platform.claude.com/docs/en/about-claude/pricing), [Gemini](https://aistudio.google.com/docs/pricing). Which model to pay for is the owner's call; quality on 15–20 real Yerevan menus decides it in Phase 6.

## What drives cost at 200 cafés

Out of $470 a month:

| Driver | Monthly | What would cut it |
|---|---|---|
| Supabase MAU over quota | $130 | Guests sign in only when they order (already the design); a guest who only reads the menu costs nothing |
| PostHog | $100 | Track fewer events, or sample guest sessions; dropping to free costs nothing |
| Supabase compute (Medium) | $50 | An estimate, not a measurement: load-test with k6 in Phase 6 before buying it |
| Realtime messages and connections | $77.50 | Guests poll every 10 s instead of keeping a socket (ADR-024); saves most of the connections and about a third of the messages |
| Everything else | ~$113 | — |

Even unoptimised, 200 cafés cost less than 1,000 AMD each per month.

## Upgrade triggers

Checked weekly from the Supabase and Vercel usage pages until a dashboard does it:

| Trigger | Action |
|---|---|
| First café starts paying | Paid hosting (commercial use), then Supabase Pro (backups) |
| Database over 400 MB on Free | Supabase Pro |
| Peak Realtime connections over 450 | Turn off the spend cap (about $10 per extra 1,000) or switch guests to polling |
| p95 API latency over 300 ms at peak, or CPU over 70 % | Next compute size |
| More than one person on the team | Sentry Team, extra Vercel seat |

## Latency, measured

Phase 1 left one number open: the round trip from a Yerevan café to the Frankfurt servers. Measured on 9 Nov 2026 with Globalping probes on five Armenian networks (Telecom Armenia, Ucom, Fnet, G-Core, House Net), using TCP connect time to AWS S3 endpoints in each region:

| Region | Median round trip | Range |
|---|---|---|
| Frankfurt (`eu-central-1`, our choice) | 59 ms | 55–77 ms |
| Dublin (`eu-west-1`) | 82 ms | 75–91 ms |

That confirms Frankfurt (ADR-019) and leaves the 2-second kitchen target with a wide margin. A guest's order takes roughly one round trip to Vercel, tens of milliseconds in Postgres, and one more round trip to reach the kitchen tablet: well under half a second.
