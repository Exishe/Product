# Pitch: Blanca by Melonpan

For the Pativ owner. A working note for the first sales visit, not something to hand to the café. The leave-behinds are `pitch-blanca-hy.md` and `pitch-blanca-ru.md`.

Sources: Blanca's own site and menu pages (fetched in this session, hy and ru versions), `product-overview.md`, `positioning.md`, `pricing.md`, `go-to-market.md`. Anything we don't know about Blanca is marked **(assumption)** or **(ask)**. We know nothing about their software, revenue or guest numbers, and this note doesn't pretend to.

## 1. Who they are

- **Blanca by Melonpan**, 2 Tamanyan St, by the Cascade, Yerevan. Part of Melonpan Group. Site: https://blanca.am.
- Modern European cuisine by their chef. Breakfast until the afternoon, with a free broth, prosecco or coffee on the breakfast menu. House-made gelato and sorbet, cocktails, a big wine list with Champagne and Armenian wines.
- Hours as you told me: about 08:00 to 02:00. **(ask)** The site shows hours by day (for example Fri and Sat 08:00 to 02:00, breakfast 08:00 to 18:00), so confirm the real hours before we plan the evening demo.
- The menu in numbers, counted from the Russian text: about 260 priced lines in about 39 sections, with more than 40 wines by the bottle, 8 by the glass and 2 wine flights.

## 2. Why they are a good first client

- **Tourists.** The Cascade is a tourist spot. Our target café has guests who need Russian or English (`positioning.md`). The menu pages we fetched are in Armenian and Russian; the English menu URL we tried returned an error. **(ask)** whether they have an English menu at all.
- **A menu that is hard to use on paper.** 39 sections and a long wine list are slow to read and expensive to reprint. A phone menu with search in three scripts fixes that without anyone learning anything.
- **Table service, long opening hours.** Breakfast, lunch, evening bar. More chances for a kitchen screen and Telegram alerts to matter than in a lunch-only café.
- **Wine and cocktails.** Drinks orders can go to a bar screen, and the stop list works for a bottle that has run out.
- **A name worth having.** If it works, a case study from a café at the Cascade is a better door-opener for the next 10 cafés than one from a side street. This is a reason for us, not for them; don't lead with it.
- **Decision maker.** Part of a group, so there may be more than one person to convince **(assumption)**. Ask on the first visit who signs off.

Honest counterweight: `go-to-market.md` says the best pilot cafés have **no iiko or other POS for orders**, because we'd be a second system. We don't know what Blanca runs. If they run a full POS with kitchen printing, the pilot is harder and the owner should decide whether to go ahead (see objection 1).

## 3. What to show in the demo

Their own menu on our platform, on a phone, at their table. No slides (`go-to-market.md`).

**Prepare before the visit** (all from their public menu; nothing goes live):

1. Build Blanca's menu in a private demo café from their website text: sections, dishes, prices, hy and ru as written. English is written by us and **checked by the owner of Blanca on the day**.
2. Add their photos **only if they say yes**. Their site has professional photos, but they are theirs; use them in the demo only with permission, and say so.
3. Model the things that make Blanca's menu hard:
   - Breakfast sets for 1, 2 and 3 people (Green, Meat, Seafood) as one dish with a size option.
   - Mini and standard pizza as one dish with a size option, so the pizza section is half as long.
   - The free broth, prosecco or coffee with breakfast as a choice with a 0 ֏ price **(assumption: option groups can carry a 0 ֏ choice; test it before the visit)**.
   - Wine by region and grape with the stop list ready for a bottle that runs out.
4. Check which parts are live. `product-overview.md` lists what is still waiting on you: the Gemini key (photo import), the Telegram bot token, Turnstile keys. Without the Gemini key, we type the menu in by hand, which is why step 1 is done in advance. Without the Telegram token, show the alert screenshots instead and say they are screenshots.
5. The preview deploy is protected. For the visit use a link and device that open without a sign-in, or the production site on your phone.

**Show in this order:**

| Step | What | What it answers for them |
|---|---|---|
| 1 | QR menu on a phone, their dishes, hy / ru / en. Search for "бургер" and "burger" | Tourists, readability, a long menu |
| 2 | Tap a breakfast set, choose 2 persons, add a free coffee, add a note, send | The thing that makes their menu special works |
| 3 | The order appears on the kitchen screen (second phone or tablet) with a timer | Kitchen sees it in seconds |
| 4 | Waiter app: table map, accept the order, mark served; "call the waiter" and "bill" from the guest phone | Staff stay in control; hybrid, not replacement |
| 5 | Stop list: mark one dish "not today", watch it grey out on the guest phone | No more "sorry, we're out" at the table |
| 6 | Owner admin: change one price, see it change on the guest phone; dashboard with orders and popular dishes | No reprinting; they see the evening |
| 7 | Telegram alerts: delayed order, offline screen, day summary | The owner can be away |

Do not show the games first. They are fun and a good icebreaker with staff, but this owner is buying a menu and an evening they can follow.

## 4. The pains we solve for them (specific to Blanca)

1. **A very long menu is hard to read and to change.** About 39 sections, a wine list with dozens of labels, prices that change. One edit updates every phone, no reprint. Search finds a dish by name in any of the three scripts.
2. **Tourists at the Cascade need Russian and English.** The guest reads in their language; the cook sees the order in Armenian. We checked their site: the menu text we found is Armenian and Russian.
3. **Complex choices cause mistakes.** Sets for 1, 2 or 3 people, mini or standard pizza, a free drink with breakfast, milk alternatives for coffee. When the guest picks these on the phone, the kitchen gets them as written, not misheard.
4. **Long hours, and the owner can't be there all of them.** Breakfast to late evening. Telegram shows only the exceptions (delayed ticket, offline screen) and a day summary after closing.
5. *(optional, if they raise it)* **Wine and bar orders.** A stop list for bottles that ran out and a bar screen so bar tickets don't sit with the food.

Do not claim: more revenue, higher average bill, faster tables. `positioning.md` says we claim none of that until pilot data exists.

## 5. Objections and honest answers

| They say | We say (and what's true) |
|---|---|
| **"We already have a POS, iiko or r_keeper."** | We don't know what they run **(ask first, don't assume)**. Stage 1 is a QR menu and ordering layer that sits next to a POS. It does not connect to iiko or r_keeper yet. So an order on our screen does not appear in their POS, and the waiter would still ring up the bill there. That's double entry, and we say so. Options: (a) start with the **free Menu plan**, which is a three-language QR menu with no ordering and no conflict with their POS; (b) pilot ordering on one service, such as breakfast, or a few tables; (c) wait until we have a POS link. `positioning.md` says: if it's iiko, "we're not the right fit today". This is your call to make before the visit. |
| **"What about fiscal receipts (HDM)?"** | We don't do HDM. Nothing changes: keep the register and the receipts exactly as now. Stage 1 doesn't print fiscal receipts. If the e-HDM decision expected in late December 2026 reaches catering, that's a Stage 2 question and we'll ask a tax adviser (`positioning.md`). Don't promise more. |
| **"Staff won't learn another system."** | The waiter app has four buttons, setup includes two minutes with each waiter, and we are there on the first Friday evening (`go-to-market.md`). The guest can still call the waiter, and the waiter's order goes to the same kitchen screen. |
| **"It must look like Blanca, not like your app."** | Partly yes today. A café picks one of three looks (Pure, Evening, Wine) and sets its own brand colour and logo. Evening (noir and champagne) is the closest to their style **(assumption, based on how the three are described)**. That redesign is **on preview only**, not production yet. Show it only if it's ready; otherwise say so. We don't copy their website's design. |
| **"What does it cost?"** | The founding offer, quoted exactly from `pricing.md`: *Service is free during the pilot, then 10,000 ֏ a month locked for 12 months, in return for a weekly 15-minute call, honest feedback and permission to publish their numbers and a quote as a case study.* Standard price after the first 10 founding cafés is 15,000 ֏ a month per location. No setup fee, no contract, month to month, no card. Prices don't rise for 12 months after they start paying. The menu stays online as a free QR menu if they stop. |
| **"What if you disappear?"** | The menu and sales history export to a spreadsheet from the admin at any time. The menu keeps working as a free QR menu. |
| **"We're a group. We'd need to talk to the others."** | Fine. Each location pays its own price; groups of five or more talk to us. Don't push a group deal. |
| **"Our guests won't scan."** | Some won't. The waiter takes their order on the order pad into the same kitchen screen. |
| **"Is your software proven?"** | No. We are a new product and this would be one of the first cafés. That is exactly why the offer is free during the pilot. Say it plainly. |

## 6. The 10-minute visit

Go between 11:00 and 12:00 on a quiet weekday, as `go-to-market.md` suggests, with two phones charged and a printed QR for one table. Ask for the owner or the manager.

| Min | Do |
|---|---|
| 0:00 | Introduce yourself and the one sentence: "Guests open your menu on their own phone in Armenian, Russian or English and order from the table; the kitchen sees it on a screen within seconds; you see the whole evening in Telegram." Ask for 10 minutes. |
| 0:30 | Two questions: how do guests order and see the menu today? What software do you use for orders and the bill? (**Listen first.** The answer to the second decides step 6 of the demo.) |
| 1:30 | Hand them your phone with their own menu open. Let them scroll and search. Don't explain. |
| 3:00 | Order breakfast set for 2 people from the phone. Show the kitchen screen on the second phone. |
| 5:00 | Show the waiter side and the stop list. Change one price on the admin and watch it update. |
| 7:00 | Show the Telegram alerts (live if the bot is on, screenshots if not). Say what we **don't** do: HDM, stock, a POS link. |
| 8:00 | The offer, in the exact words of section 5. Ask for the pilot, not for a contract. |
| 9:00 | Ask for the items in section 7. Leave the one-page letter (hy or ru). |
| 10:00 | Agree a day for the setup visit. Leave. |

## 7. What to ask for to close

A yes to the pilot means we need these. Write them down on the spot.

1. **Menu owner:** who may change the menu and prices after setup, and who approves the English text.
2. **Photos:** may we use the photos from their site and Instagram, and do they have originals? Who has the right to give them to us?
3. **Table count:** how many tables and zones (hall, terrace, bar), and numbering, so we can print the QR cards (four per A4 page).
4. **Wi-Fi:** is there staff Wi-Fi, and a spare tablet or old phone for the kitchen and the bar?
5. **Manager contact on Telegram** (or Viber, if they live there): one person who answers during service. Also which messenger the owner prefers for alerts. `positioning.md` warns many owners live in Viber; web push is the fallback.
6. **Pilot start date and the first Friday evening** when we will be on site (`go-to-market.md`: weeks 0 and 1).
7. **Permission** to publish their numbers and a quote as a case study, in writing in a message, as the founding offer requires.

## 8. Internal flags for you, before the visit

- **Free-only rule.** Everything in this offer is free: the pilot is free for them and runs on our free tiers. Charging after the pilot starts paid hosting (Vercel Pro, about 16,800 ֏ a month from the first paying café). That is a money decision and it is yours, not part of this offer.
- **Capacity.** `go-to-market.md` says free hosting carries 1 to 3 cafés, and dish photos use up the free egress at about 5 cafés. A photo-heavy menu of about 260 lines should use compressed images.
- **Gemini and Telegram keys** are not set yet (`product-overview.md`). Photo import and live alerts depend on them.
- **Their Armenian and Russian menus are the source.** Check the prices we copy. The menu pages have a few inconsistencies worth confirming rather than fixing silently, for example one set is named "Meat" in Latin letters in the Russian menu, and two prices (a vermouth at 18,000 ֏ and a few in "AMD" rather than ֏) look odd. **(ask)** before we publish.
- **No claims we can't back.** No percentages, no "faster", no "more orders". If they ask for numbers, say the pilot will produce them.
- **Do not tell them anything about their current software, revenue or guests.** We don't know it.
