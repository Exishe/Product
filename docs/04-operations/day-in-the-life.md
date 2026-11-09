# A Friday evening at a 12-table café

A fictional café in central Yerevan, on a busy Friday. Eight tables in the hall and four on the terrace. The staff:

- the owner, who is on site until 21:00 and then at home;
- two waiters: one with the shared tablet, one with an Android phone;
- a cook and a grill cook sharing the kitchen screen;
- a barista with the bar screen, an old phone on a stand.

Guests are a mix of locals, Russian speakers and tourists. Expected volume: about 70 orders and 250 dishes between 18:00 and midnight, two thirds of them through the QR code.

Each incident links to its row in `reliability.md`. The **Design change** lines are things this walkthrough added to the plan; they're collected at the end.

---

### 17:45 Opening

- Owner: opens the admin on a phone. Today's stop list is empty. Sevan trout didn't arrive, so the owner marks it «Այսօր չկա». Every guest menu shows it greyed out at once; nobody has to reprint anything.
- Kitchen and bar: the tablets are on their chargers and on the wall stands. Someone taps «Սկսել հերթափոխը» on each, which turns on sound and keeps the screens awake. The connection dots are green.
- Waiters: the shared tablet opens the floor map. All 12 tables show «Ազատ».

### 18:20 First guests

- Table 5 (a couple, Armenian): one scans the QR, orders khorovats, a summer salad and Armenian coffee, sweet.
  - The kitchen screen beeps within a second or two, and the bar phone gets the coffee.
  - The owner switched on every-order alerts for the first week, so Telegram shows «Նոր պատվեր՝ սեղան 5, 6 500 ֏». By default only exceptions arrive (ADR-040).
- Table 2 (no smartphone, an older couple): the waiter takes the order on the tablet's order pad. It reaches the kitchen the same way and is marked «Մատուցող».

### 19:05 Tourists

- Table 9 (four German tourists): they open the menu in English and search "khorovats"; the dishes come up although the menu is written in Armenian.
- One adds a note: "no onion, allergy". The note appears highlighted on the kitchen slip as written, with the dish name in Armenian above it.
- Risk: the cook may not read English. Guest notes are short, so for Stage 1 the waiter tablet shows the note too, and the waiter can say it out loud. Stage 2 adds automatic translation of notes for the kitchen.

### 19:40 Rush begins

- Kitchen: nine tables seated. The kitchen screen shows 7 tickets in «Պատրաստվում է». Tickets older than 8 minutes get the apricot edge with «Շտապել»; older than 12 get the red «Ուշանում է».
- Waiter tablet: tables turn green («Պատրաստ է») as food is ready. Guests on the terrace call the waiter from their phones instead of waving; table 11 turns red, «Կանչում են», on the tablet.

### 19:52 Guest orders twice (`reliability.md` R5)

- Retry: at table 7 a guest taps "Send to the kitchen", the terrace signal drops, the phone retries.
  - The retry uses the same idempotency key, so one order exists; the smoke test checks exactly this.
  - The guest sees «Ուղարկվում է…» for four seconds, then the status page.
- Two phones, same dishes: a minute later the friend at the same table orders the same two tolmas from another phone, thinking the first order failed. Two real, separate orders arrive.
  - Design change: an order with the same dishes as another order from the same table within 3 minutes, but from a different phone, doesn't go straight to the kitchen. It waits for the waiter, marked «Հնարավոր կրկնություն»: the waiter asks the table and accepts or rejects. Small orders from different guests at a table aren't affected unless the dishes match.

### 20:10 Kitchen overloaded (R6)

- The squeeze: the grill is the bottleneck: 14 khorovats portions in the queue, the oldest at 18 minutes. Guests on the status page see «Պատրաստվում է» for a long time and start calling waiters.
- What the system gives today:
  - the lateness colours;
  - a Telegram ping to the owner for tickets over 20 minutes;
  - the stop list: the grill cook can pause "Խորոված" for 20 minutes, so new guests can't order it.
- Gap: guests who already ordered get no explanation.
  - Design change: a "kitchen busy" switch on the kitchen screen and in the admin. It sets an expected wait (20, 30 or 45 minutes) that guests see on the menu and on their status page: «Խոհանոցը ծանրաբեռնված է։ Սպասման մոտավոր ժամանակը՝ 30 րոպե։» It turns itself off after an hour.

### 20:25 Waiter cancels an item (R7)

- The request: table 3 cancels one of two chicken khorovats; the kitchen has already started.
- What happens:
  1. The waiter opens the table and cancels one portion with the reason «Հյուրը հրաժարվեց».
  2. A red slip appears on the kitchen screen: «Չեղարկվել է», with "1 × Հավի խորոված" struck through. The grill cook taps «Հասկացա».
  3. The bill drops by 3 300 ֏, and the guest's status page shows the line struck through.
- After the food is out: if the dish has already been served, cancelling it counts as a comp and needs a manager. The waiter calls the owner, who approves from a phone.

### 20:41 Wi-Fi drops (R1)

- What drops: the café's router reboots. It's back after 4 minutes; for those 4 minutes only staff devices lose the internet.
- Kitchen:
  - The slips stay on screen, timers keep counting, the dot turns red.
  - Taps queue: «Կապ չկա, 3 գործողություն սպասում է».
- Waiter tablet:
  - It shows the last known map.
  - The waiter takes table 10's order on the order pad; it queues.
  - Closing table 4 is disabled until the connection returns.
- Guests: most are on mobile data, so their orders keep arriving in the cloud.
  - The kitchen can't see them until the tablet reconnects.
  - When it does, it refetches everything and four new slips appear with one beep.
- Gap: for 4 minutes the kitchen didn't know about new orders.
  - Mitigation (onboarding checklist): keep one phone with mobile data as a hotspot for the kitchen tablet. The kitchen app shows «Կապ չկա» in red after 15 seconds, so someone switches to the hotspot.
  - Phase 6 tests this switch on a real tablet.

### 21:05 Owner leaves

The owner leaves for home. Telegram keeps reporting new orders, plus two "late" pings from the grill earlier. From the sofa the owner looks at today's sales: 41 orders, 512 000 ֏ so far.

### 21:30 Kitchen tablet dies (R2)

- What failed: the kitchen tablet's charging cable was loose; the battery runs out mid-rush.
- What still works: orders keep arriving and nothing is lost; they're in the database. But the cooks can't see them.
- The fallback, in order:
  1. The second waiter's phone can't run the kitchen screen: waiter devices don't have kitchen rights.
  2. The owner can sign in to the kitchen screen from any phone, from home. Tonight the owner sees the Telegram alert «Խոհանոցի էկրանն անջատված է 2 րոպե» (kitchen screen offline for 2 minutes, a new alert) and calls the café.
  3. Plugged in properly, the tablet is back in 5 minutes and catches up.
- Design change: an alert when a station screen has been offline for more than 2 minutes during opening hours.
- Design change: a spare device can be paired as a second kitchen screen ahead of time. Pairing is per device, so a café can have two kitchen screens on one station, and the spare sits in a drawer, charged.

### 22:15 Last table at the terrace

- The bill: table 22 asks for the bill from the phone. The tablet shows «Հաշիվ» on table 22.
- The payment: the waiter brings the card terminal. The guests pay 7 400 ֏ by card and leave 1 000 ֏ in cash as a tip.
- Recording it: the waiter closes the table, «Քարտով» for 7 400. Tips aren't on the bill in Stage 1.
- Afterwards: the table turns «Ազատ», and the old guest sessions stop working, so the next party at table 22 starts a fresh bill.

### 23:10 Forgotten table (R8)

- What happened: table 6 left 40 minutes ago, but the waiter forgot to close the table. A new couple sits down, scans, orders.
- The problem: their order joins the old open table session, so the next bill would contain both parties' food.
- What the waiter sees: «Բաց է 3 ժամ» on table 6 and, in the panel, orders separated by time. The waiter closes the first part, but Stage 1 has no split bill.
- Design change: when every order at a table has been served, the bill was requested (or 45 minutes passed with no new order), and a new guest joins, the waiter gets «Սեղան 6․ նոր հյուրե՞ր» with one tap to close the old bill first. The new guest's order waits for that tap.

### 23:58 Closing

- Tables: the last tables are closed and the waiters' tablet shows all tables free.
- Kitchen and bar: «Ավարտել հերթափոխը» turns off sound and lets the screens sleep.
- Summary: at closing time the owner's Telegram gets the day summary: orders, revenue, average bill, top dishes, cancellations with reasons, average kitchen time.
- Business day: it runs until 05:00, so the 00:20 order from the last table still counts for Friday.

---

## Design changes found here

| # | Change | Where |
|---|---|---|
| 1 | Possible duplicate: same dishes from another phone at the same table within 3 minutes wait for the waiter | `private.place_guest_order`, waiter panel |
| 2 | "Kitchen busy" switch with an expected wait shown to guests | `locations`, guest menu, status page, kitchen screen |
| 3 | Alert when a station screen is offline for more than 2 minutes during opening hours | Device heartbeat, notification outbox |
| 4 | Several screens per station, so a spare can be paired in advance | Device pairing (already possible; make it part of onboarding) |
| 5 | Stale table guard: a new guest at a table that looks finished asks the waiter to close the old bill first | `private.join_table`, waiter panel |
| 6 | Guest notes shown on the waiter tablet too; automatic translation of notes for the kitchen in Stage 2 | Waiter panel |
| 7 | Onboarding: a hotspot phone for the kitchen tablet, a charging stand with a fixed cable, a spare device | `onboarding-a-cafe.md` |
| 8 | Mark an order as a test (from onboarding or training) so it's left out of sales reports | `orders.is_test`, dashboard queries |

These go into `docs/06-build/plan.md`. Changes 1, 2, 3 and 5 also go into the Stage 1 migrations; the schema needs a `kitchen_busy_until` and `expected_wait_minutes` on `locations`, and a `last_seen_at` on members for device heartbeats.
