# Go to market

How we get the first 10 cafés, then the next 50. Every visit, demo and setup needs a person in Yerevan: the owner, or someone the owner sends. The software side (demo café, help articles, case study pages) is ours to prepare.

## Constraints we plan around

- Free only, for now (ADR-025). No paid ads, no printed flyers, no purchases. Visits, referrals and our own Instagram and Telegram cost only time.
- Free hosting carries 1–3 cafés (`costs.md`: dish photos use up the 5 GB of free egress at about 5 cafés). So the pilot starts with 3 cafés, and growing past that means paid hosting, which comes with the first paying café anyway.
- One person selling and setting up. A setup takes 30 minutes plus travel (`onboarding-a-cafe.md`), so two setups and a handful of visits a day is the ceiling.
- The product has to be live first. Field research can start now; pilots start when Phase 6 has the guest menu, ordering, kitchen screen and waiter app working on a preview deploy.

## Step 0: walk the streets (2 weeks, can start now)

Visit 20 cafés in Kentron between 11:00 and 12:00, when they're open and quiet. Pick streets with many independent cafés and tourist traffic: around Northern Avenue, Abovyan, Saryan, Tumanyan and Pushkin streets, and the Cascade. Ten minutes per café, with the owner or manager.

Questions:

1. How do guests see the menu now: paper, QR, Instagram, a board? Who updates it, and how often do prices change?
2. How does an order get from the table to the kitchen?
3. What software do you pay for (POS, delivery apps, a QR menu)? How much a month?
4. What goes wrong on a busy Friday?
5. Roughly how many orders on a normal day, and on Friday? How many tables?
6. What share of guests are tourists, and which languages do they speak?
7. Which messenger do you and your staff use for work: Telegram, Viber or WhatsApp?
8. Is there Wi-Fi for staff devices, and a spare tablet or old phone?
9. Would you try it free for a month if we set it up for you?
10. If it works, what monthly price feels fair? What feels too expensive? (Ask only after they've seen the demo.)

Also ask: may we photograph your paper menu? Those photos are the test set for the AI menu import: we need 15–20 real Yerevan menus before promising a setup time (`gaps.md`).

Output: `docs/00-research/field-notes.md` with the answers per café (no personal data beyond the café name and the role of the person), the menu photos stored outside the repo, and a ranked list of pilot candidates.

## Step 1: three pilot cafés (about 8 weeks)

Choose from the field visits. A good pilot café has:

- an owner who answered the questions with interest, not politeness;
- 30 or more orders on a normal day, and table service;
- guests who aren't all locals;
- usable Wi-Fi and a device for the kitchen;
- no iiko or other POS for orders (we'd be a second system for them, and a confusing pilot).

The offer: free for the whole pilot; we set it up in person; we're there on the first Friday evening; founding price after (`pricing.md`). In return: a 15-minute call each week, honest answers, and permission to publish their numbers and a quote.

| Week | What happens |
|---|---|
| 0 | Setup visit, following `onboarding-a-cafe.md` to the minute. Note every step that takes longer than written |
| 1 | On site for the Friday evening rush, 19:00–22:00. Fix what breaks; watch where staff hesitate |
| 2–8 | Weekly call with the numbers from `metrics.md`. Fixes ship in the quiet hours (before 11:00), never on Friday or Saturday evening |
| 8 | Decision call: do they pay, and at what price? |

Move on to step 2 when:

- 2 of 3 cafés are activated (`metrics.md`) and still use it on Friday nights in week 8;
- p95 order to kitchen screen is 2 seconds or less, with no lost orders;
- at least 2 of 3 owners say they'll pay the proposed price.

If not: find out why before adding cafés. Ten unhappy cafés teach less than three happy ones and cost more.

## Step 2: ten cafés

- Offer: a free first month, then the standard price; the first 10 get the founding price.
- The case study: one page in Armenian and Russian about the best pilot café, with real numbers (orders through QR per day, share of guests ordering in Russian or English, kitchen time) and the owner's own words. Photos of the kitchen screen in use. Published on our site and Instagram, printed on A4 for visits.
- Nothing in their café changes for the demo: it runs on our demo café on a phone, and their own menu goes in only if they want to try. Owners fear switching systems "like moving apartments" (`docs/00-research/video-notes.md`, A5).
- The demo is their own menu: photograph it during the visit, and in a few minutes show it on the owner's phone in three languages. Then place an order from a table and let the owner watch it reach the demo kitchen screen on a second phone. No slides.
- Pace: about two new cafés a week. Each new café gets the same week-1 Friday visit.

### Answers to what owners will say

| Owner says | We say |
|---|---|
| "Paper works fine." | It does, until prices change or a German table waves for 10 minutes. Try a month free; if guests don't use it, the menu stays as a free QR menu. |
| "Our guests won't scan anything." | Some won't, and the waiter takes their order on the tablet into the same kitchen screen. The QR is for the ones who'd rather not wait. |
| "Our Wi-Fi is bad." | Staff screens keep working offline and catch up; guests order on mobile data. We'll show you what happens when the router reboots. |
| "We already have iiko." | Then you have a POS, and we're not the right fit today. We'll come back when we have a link to it. |
| "15,000 is a lot." | It's less than one dinner for two, and less than the cheapest iiko plan. If it doesn't earn that in a month, don't pay. |
| "What about the HDM?" | Nothing changes: keep your register and your receipts exactly as now. |
| "My staff won't learn it." | The waiter app has four buttons. Setup includes two minutes with each waiter, and we're there on the first Friday. |
| "What if you disappear?" | Your menu and sales history export to a spreadsheet from the admin at any time. |
| "We tried software before. It was like moving house." | Nothing moves: the menu comes from a photo, your cash register and receipts stay, and if you stop, the menu stays online as a free QR menu. |
| "Waiters will feel replaced." | They take fewer trips and cover more tables. Guests choose: order on the phone or call the waiter, and the waiter's order goes to the same screen. |

## Step 3: the next 50

Ranked by how much each channel brings per hour spent, all free:

1. Referrals. An owner who brings another café gets a free month, and so does the new café. Owners on the same street know each other.
2. Street by street. When one café on a street runs it, visit the neighbours with the case study. Their guests have already seen the QR next door.
3. The free Menu plan. Self-service sign-up with the photo import; the "made with" link on each free menu brings the next owner. Menu cafés that start getting tourists are the easiest upgrade to Service.
4. People who already visit cafés every week: coffee roasters and distributors, HoReCa equipment suppliers, accountants who serve cafés, bank card-terminal managers. We offer their clients a free month; they get a reason to call.
5. Our own Instagram and Telegram channel, in Armenian and Russian: a paper menu next to the same menu on a phone, 20 seconds of a kitchen screen on a Friday, an owner explaining what changed. One real thing per post.

Not now: paid ads (free-only rule), trade fairs (cost), Glovo-style marketplaces (they're for delivery).

### Targets

These are targets to plan against, not a forecast; the pilot will move them.

| Month after the pilot starts | Cafés live | Paying | Monthly revenue at 15,000 ֏ |
|---|---|---|---|
| 2 | 3 | 0 | 0 |
| 3 | 10 | 3 | 45,000 ֏ |
| 6 | 30 | 20 | 300,000 ֏ |
| 9 | 60 | 50 | 750,000 ֏ |

At 50 paying cafés, infrastructure is about 41,000 ֏ a month, 5.5 % of revenue (`costs.md`). The real limit is support at the response times in `support.md`: it needs a second person at around 30–40 cafés.

## What we need before the first visit

| Item | Owner | Status |
|---|---|---|
| Demo café «Դեմո սրճարան» on a preview deploy, with a working kitchen screen | Us | Phase 6 |
| The one-page pitch in Armenian and Russian (`pitch-onepager.md`) | Us | Done; the phone or Telegram contact is still a slot |
| Pricing card with the decided prices | Us | Prices decided; card made in Phase 6 |
| Field visit question sheet (above), printed | Owner | Ready |
| Brand name and logo | Us | Name decided: Pativ («Պատիվ», ADR-039). Logo: a wordmark in Noto Serif Armenian, made in Phase 6 |
| A web address for the landing page and the free sign-up | Owner | Open: a domain costs about $15 a year, so it waits for the free-only rule to change |

## Risks

| Risk | What we'd see | What we do |
|---|---|---|
| Owners live in Viber, not Telegram | Field visits answer question 7 | Alerts by web push instead; support chat in their messenger |
| Locals don't scan QR codes | QR share under 30 % after a month | Lead with the waiter app and kitchen screen; QR becomes the tourist feature |
| AI import misreads real menus | Many owner corrections in the pilot | Setup visit allows time for manual entry; improve prompts on the 20 photos |
| The December 2026 e-HDM decision covers catering | News in late December | Ask a tax adviser in January; it changes Stage 2, not the pilot |
| A cheap foreign tool adds Armenian | A competitor appears in the field visits | Compete on setup in person, support in Yerevan, Telegram, menu quality; the free Menu plan covers the low end |
