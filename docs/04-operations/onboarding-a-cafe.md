# Getting a café live in 30 minutes

A runbook for the person who sets up a new café, usually us, sitting with the owner at the café before opening. The goal: a real order from a real table reaches the kitchen screen and the owner's Telegram within 30 minutes of starting.

Owner: whoever does the visit. Frequency: every new café. Last tested: not yet; the first dry run is in Phase 6 with the demo café, and the first real one is pilot café #1.

## Before the visit (the day before, 10 minutes by phone)

Ask the owner to have ready:

- [ ] The paper menu, or the current price list, with prices up to date.
- [ ] The number of tables and how they're numbered (do they have numbers on them already?).
- [ ] Which languages to show guests (default: Armenian, Russian, English).
- [ ] An email address and Telegram on the owner's phone.
- [ ] A tablet or spare phone for the kitchen, with its charger, and a place to mount it near the pass. A second one for the bar if drinks are made separately.
- [ ] The café Wi-Fi name and password.
- [ ] The logo as an image file, if they have one (optional).

We bring:

- [ ] A laptop or tablet logged into nothing (the owner signs up on their own phone or our laptop).
- [ ] A portable printer with A4 sticker paper, or the café's own printer, for the QR cards.
- [ ] Table stands or holders for the cards, if the café wants them (cost and supplier: [confirm]).
- [ ] A pack of paper order pads and a laminated «Պատվերներն ընդունում է մատուցողը» card for the bar drawer (the paper fallback, RB3 in `reliability.md`).

## At the café

Times are elapsed minutes from the start. Each step says what success looks like and what to do if it doesn't happen.

### 0–3 Sign up

On the owner's phone or our laptop: «Գրանցվել», email, password, café name, address. The app creates the café, its first location, a kitchen station and a 30-day free trial (`api.create_restaurant`).

- Done when: the admin opens on «Կառավարման վահանակ».
- If the confirmation email is slow: carry on. Only publishing waits for email confirmation, and it usually arrives within a minute.

### 3–6 Tables and languages

Settings: guest languages, then "Tables": enter the count (12) and areas (Hall 1–8, Terrace 21–24). The floor plan is generated in a grid; drag tables roughly into place, or leave it for later.

- Done when: the table list matches the numbers on the café's tables.

### 6–18 Menu from photos

1. «Լուսանկարել ճաշացանկը». Photograph each page flat, in good light, filling the frame. 1 to 8 photos.
2. Reading takes 20–60 seconds. Meanwhile, set the logo and brand colour.
3. Review with the owner:
   - Start with the flagged rows: «Ստուգեք գինը», «Ստուգեք անունը».
   - Then go category by category and approve with «Հաստատել ամբողջ բաժինը» after the owner has read it.
   - Assign Bar to the drinks categories so they go to the bar screen.
4. Fix anything the AI missed by hand. For a 40–60 dish menu, review takes 8–10 minutes.

- Done when: the progress bar shows every dish checked.
- If the photo is unreadable: retake it closer and flatter. If the AI service is down or the daily limit is hit, enter the 10 best-selling dishes by hand now and the rest after the visit; the café can still go live.

### 18–19 Publish

«Հրապարակել ճաշացանկը».

- Done when: «Ճաշացանկը հրապարակված է» appears, and «Բացել ճաշացանկը» shows the menu as guests will see it, in all three languages.

### 19–24 Print the QR cards

"Tables and QR" → "Print". One A4 sheet holds 4 cards: café logo, table number, QR code in the brand colours, «Սկանավորեք՝ պատվիրելու համար» with Russian and English below. Print, cut, stick or put them in stands.

- Done when: scanning the card for table 1 with the owner's phone opens the menu with «Սեղան 1».
- If a card scans to the wrong table: reprint that table from the same screen. The old card stops working automatically.

### 24–27 Pair the kitchen and bar screens

On the kitchen tablet, open the app address and choose «Միացնել սարքը». In the admin, "Staff and devices" → "Add device" → Kitchen gives a 6-digit code valid for 10 minutes; type it on the tablet. Same for the bar, and for the waiter tablet or phones.

Then on each kitchen and bar device:

- [ ] Turn off auto-lock in the system settings.
- [ ] Set the volume to maximum.
- [ ] Add the app to the home screen.
- [ ] Tap «Սկսել հերթափոխը».

- Done when: each device shows a green connection label.
- If the device's browser is very old: try Chrome. If the device can't run it, note it and use the owner's spare phone for now.

### 27–28 Telegram

"Telegram" → «Միացնել Telegram» on the owner's phone opens the bot; tap Start.

- Done when: "Send test" delivers a message to the owner's Telegram.

### 28–30 Test order

The owner scans table 3 and orders two items, one from the kitchen and one from the bar.

- [ ] The kitchen slip appears within 2 seconds, and the bar slip on the bar screen.
- [ ] The order is marked «Փորձնական», so it stays out of the sales report.
- [ ] Kitchen taps «Սկսել», then «Պատրաստ է»; the owner's phone shows the status moving.
- [ ] The waiter marks it served and closes the table with «Կանխիկ».

Live.

## Before leaving (5 more minutes, outside the 30)

- [ ] Show the waiters the tablet: accept, served, call, close table. Two minutes each is enough.
- [ ] Dry run, 5 minutes: each waiter takes two test orders on the tablet and one guest order comes by QR; the kitchen moves them to ready; every table ends closed. All marked «Փորձնական».
- [ ] Name one champion per shift, the person staff ask first. Usually the head waiter.
- [ ] Scan two QR cards from a guest's seat with the lights as they are at 21:00. Dim corners are where QR ordering fails.
- [ ] Set up the hotspot fallback: which phone, its hotspot name, and that the kitchen tablet knows it.
- [ ] Put the paper fallback pack in the bar drawer.
- [ ] Tell the owner how to reach support: the Telegram support chat (`support.md`).

## After the visit

| When | What | Why |
|---|---|---|
| Same evening | Watch the first service from the platform admin; message the owner if orders stall | Catch problems before the owner does |
| Next morning | Send the champion one short guide per role (waiter, kitchen, owner) in Armenian and Russian | Staff learn from one page, not from a manual |
| Next day | Call the owner: what confused staff, what guests asked | Fix onboarding and copy |
| Day 7 | Check activation (published menu, paired kitchen screen, 20 real orders on 3 different days), QR share, kitchen times | First-week activation metric (`docs/05-business/metrics.md`) |
| Day 25 | Trial ending: talk about the subscription | Conversion |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| QR opens "this QR no longer works" | Card printed before a reprint, or the wrong environment (preview vs live) | Reprint from "Tables and QR" on the live site |
| Kitchen tablet doesn't beep | «Սկսել հերթափոխը» not tapped, or volume off | Tap it; check the volume; check silent mode |
| Kitchen tablet goes black | Auto-lock still on | Turn off auto-lock; plug into the charger |
| Guest says the menu is in the wrong language | Their phone's language | Show them the Հայ / Рус / Eng switch at the top |
| Bar items appear on the kitchen screen | Category not assigned to Bar | Admin → Menu → category → prep area: Bar; republish |
| Telegram silent | Bot blocked or the chat not linked | "Send test"; relink with a new code |
