# Stage 1 screens

Every Stage 1 screen, its job and its states. Four of them have clickable mockups in `design/`, marked "Mockup" below. Copy shown here is Armenian, the reference language. Russian and English follow the same meaning in `messages/ru.json` and `messages/en.json`.

States used everywhere:

- Loading: a skeleton of the real layout, never a centred spinner. Under 300 ms, show nothing.
- Empty: says what will appear here and how to make it appear.
- Error: says what happened and what to do, in the interface's voice. No apologies, no error codes in the main text.
- Offline (staff screens): a banner with the number of waiting actions; the screen keeps working from cache (`docs/01-architecture/realtime.md`).

Sizes: guest screens are designed at 360–430 px wide, waiter screens at 820–1180 px (tablet, either orientation), the kitchen board at 1280 × 800 and larger, admin at 1024–1440 px.

---

## Guest (phone)

### 1. Menu (mockup, `design/guest.html`)

Café name, table chip, language switch (Հայ, Рус, Eng), search, sticky category tabs, then the menu as a printed list: dish name in condensed serif, dotted leader, price, one-line description, portion, tags. A round apricot "+" adds simple dishes in one tap; dishes with required options open the item sheet. A sticky cart bar appears once something is in the cart.

| State | What the guest sees |
|---|---|
| Loading | Server-rendered from the published snapshot, so normally no loading state. Fonts swap in without layout shift. |
| Empty menu | Can't happen for guests: the QR only works after the first publish. A preview link for an unpublished menu shows «Ճաշացանկը դեռ հրապարակված չէ։» |
| Sold out item | Greyed name and price, «Այսօր չկա» in pomegranate, no add button. |
| Search, no result | «Այդպիսի ուտեստ չգտանք։ Փորձեք այլ բառ։» |
| Ordering switched off | The menu still shows, without add buttons, and a calm notice: «Այս պահին պատվերներն ընդունում է մատուցողը։» |
| Invalid or old QR | «Այս QR կոդն այլևս չի գործում։ Խնդրեք մատուցողին օգնել։» (from `/t/<token>`) |

### 2. Item detail (mockup, bottom sheet in `design/guest.html`)

Name, description, portion, modifier groups (radio for one choice, checkboxes for several), note for the kitchen, quantity stepper, add button with the live price.

| State | Behaviour |
|---|---|
| Required group not chosen | The first option is preselected. The add button is disabled only if the guest clears a required choice. |
| Note too long | The textarea stops at 200 characters; a counter appears from 160. |
| Sold out while open | The add button turns into «Այսօր չկա» when the stop list changes (Realtime hint or on add). |

### 3. Cart (mockup)

Lines with options, notes and quantity steppers, total, a line about paying the waiter, and one button: «Ուղարկել խոհանոց».

| State | Behaviour |
|---|---|
| Empty | Never shown: removing the last line returns to the menu. |
| Sending | Button shows «Ուղարկվում է…» and is disabled. The idempotency key is created when the button is pressed and reused on every retry. |
| No connection | «Կապ չկա։ Պատվերը պահված է, կուղարկենք, երբ կապը վերականգնվի։» The button turns into «Փորձել նորից»; a retry never creates a second order. |
| Item sold out meanwhile | The line is marked «Այսօր չկա», the total updates, the guest confirms again. |
| Rate limited | «Շատ պատվերներ կարճ ժամանակում։ Կանչեք մատուցողին։» |
| Order needs a waiter (large total or café setting) | Sent normally; the status screen starts at «Ստացվել է» and says the waiter will confirm. |

### 4. Order status (mockup)

Order number, a five-step tracker (Ստացվել է, Ընդունվել է, Պատրաստվում է, Պատրաստ է, Մատուցված է), what was ordered, the total, and two actions: «Կանչել մատուցողին», «Խնդրել հաշիվը». «Պատվիրել ևս» goes back to the menu. Several rounds at the same table show as a list, newest first.

| State | Behaviour |
|---|---|
| Live | Updates over the guest's Realtime channel, with a 10 s safety poll. |
| Rejected | «Մատուցողը չհաստատեց պատվերը։» plus the reason, if given, and «Կանչել մատուցողին». |
| Item cancelled | The line is struck through and the total updates. |
| Paid | Tracker ends with «Վճարված է», then «Շնորհակալություն։» The session closes; ordering again needs a new scan. |
| Reconnecting | A small line under the tracker: «Թարմացնում ենք…». No modal. |

---

## Waiter (tablet)

### 5. Floor map (mockup, `design/waiter.html`)

Areas as tabs (Դահլիճ, Պատշգամբ), tables drawn as they stand in the room, each with number, status word and time open. Colour and word together:

- Ազատ (free)
- Զբաղված (busy)
- Նոր պատվեր (new order: apricot, pulses once)
- Պատրաստ է (food ready: tarragon)
- Կանչում են (calling: pomegranate)
- Հաշիվ (bill requested: ink)

A counter in the top bar shows how many tables are waiting.

| State | Behaviour |
|---|---|
| No tables yet | «Սեղաններ դեռ չկան։ Ավելացրեք դրանք կառավարման վահանակում։» with a link for owners and managers. |
| Offline | Banner with pending actions; the last known map stays visible. |
| Several things at one table | Priority for the colour: calling > new order > ready > bill > busy. The detail panel lists all of them. |

### 6. Table detail and order taking (mockup, right panel)

The table's orders, each with source (QR or waiter), per-station status chips and lines. Actions appear where they apply:

- «Ընդունել» / «Մերժել» on QR orders waiting for confirmation;
- «Մատուցված է» on ready food;
- «Գնում եմ» on a call;
- «Ավելացնել պատվեր» for a new round, which opens the order pad: the same menu as the guest's, compact, with search and big touch targets;
- «Փակել սեղանը» for settlement, with payment as cash, card or split.

| State | Behaviour |
|---|---|
| New QR order pending | Close is disabled with the reason «Նախ ընդունեք կամ մերժեք նոր պատվերը։» |
| Payment doesn't add up | «Գումարը պետք է լինի 9 800 ֏, հիմա՝ 9 900 ֏», confirm disabled. |
| Stale action (someone else acted) | Toast «Արդեն մատուցված է», panel refreshes. |
| Offline | Order pad and status taps queue. Closing the table is disabled: «Վճարումը կգրանցենք, երբ կապը վերականգնվի։» |
| Cancel a line | Quantity picker plus reason; after the food is served only a manager can do it. |

---

## Kitchen

### 7. Kitchen board (mockup, `design/kitchen.html`)

Station name, connection, clock; three columns: Նոր, Պատրաստվում է, Պատրաստ. Tickets are paper slips with the table number at 64 px, quantity boxes and dish names at 28 px, notes highlighted. One big action per slip: «Սկսել», «Պատրաստ է», and in the ready column «Վերադարձնել». Late tickets get a coloured edge and a word: «Շտապել» at 8 minutes, «Ուշանում է» at 12 (configurable). Cancellations arrive as red slips with struck-through lines and «Հասկացա».

| State | Behaviour |
|---|---|
| Start of shift | Full-screen «Սկսել հերթափոխը». The tap unlocks sound and asks for a screen wake lock. |
| Empty column | «Այստեղ դեռ ոչինչ չկա։» in dim text. |
| New ticket | Slides in from the left, double beep. |
| Offline | Connection pill turns red: «Կապ չկա, 2 գործողություն սպասում է». Taps queue and replay. |
| Device signed out | Full screen: «Այս սարքն անջատված է։ Խնդրեք սեփականատիրոջը նորից միացնել։» |
| Stop list | A side drawer lists today's sold-out dishes, with a toggle per dish. |

---

## Owner admin

### 8. Sign up and first steps

Email + password (or magic link). Then a short setup: café name, address, languages offered, how many tables (creates them), and the menu: «Լուսանկարել ճաշացանկը» or «Լրացնել ձեռքով».

| State | Behaviour |
|---|---|
| Slug taken | Suggests the next free one. |
| Email not confirmed | Can continue setup, but publishing waits for confirmation. |

### 9. Menu editor

Categories in a left column, dishes in the main area, editing in a side panel: names and descriptions in hy, ru and en side by side, a completeness mark per language, price, portion, prep area (Kitchen, Bar), modifier groups, photo, tags. Drag to reorder. A banner shows unpublished changes with «Հրապարակել».

| State | Behaviour |
|---|---|
| Empty menu | Two big options: photo import or manual. |
| Missing translation | Language tab marked with a dot. Guests see the fallback language until it's filled. |
| AI text not reviewed | Rows marked «Ստուգեք»; publish shows how many remain and links to them. |
| Saving | Autosave per field, with a small «Պահված է» confirmation; a conflict shows both versions. |

### 10. Menu from a photo (mockup, `design/import.html`)

Steps: Լուսանկար, Ճանաչում, Ստուգում, Հրապարակում.

- Upload: up to 8 photos, resized in the browser to 1600 px.
- Reading: progress named by step: «Կարդում ենք լուսանկարը», «Թարգմանում ենք», usually 20–60 s.
- Review: the photo on the left; focusing a dish highlights its line in the photo. The draft is on the right: Armenian name, price, Russian and English, with flags «Ստուգեք գինը» or «Ստուգեք անունը» where the reading is uncertain. Rows are approved one by one or per category. Publishing stays locked until every dish is checked.
- Done: «Ճաշացանկը հրապարակված է» with «Տպել QR կոդերը».
- Notice: the free-tier disclosure is shown above the review.

| State | Behaviour |
|---|---|
| Photo unreadable | «Չհաջողվեց կարդալ լուսանկարը։ Լուսանկարեք ավելի մոտից, լավ լույսի տակ։» with tips. |
| Partly read | The read dishes go to review; the rest is listed as «Չկարդացված տողեր» for manual entry. |
| Provider down or limit hit | «Ավտոմատ ճանաչումը հիմա հասանելի չէ։ Կարող եք շարունակել ձեռքով կամ փորձել 10 րոպեից։» The draft and photos are kept. |
| Daily limit | «Այսօրվա ներմուծումների սահմանը լրացել է։ Փորձեք վաղը։» |

### 11. Tables and QR codes

The floor plan editor: add, drag and resize tables; set areas. A print view of A4 sheets with one card per table: café logo, table number, QR in brand colours, and a short line in three languages («Սկանավորեք՝ պատվիրելու համար», "Scan to order", «Сканируйте, чтобы заказать»). "Reprint" per table invalidates that table's old QR.

| State | Behaviour |
|---|---|
| Menu not published | Printing is allowed, with a warning that guests will see "menu not published". |
| Reprint | Confirms in the page that the old sticker will stop working. |

### 12. Staff and devices

People (owner, managers, invited by email) and devices (kitchen screens, waiter tablets, paired with a 6-digit code that lives 10 minutes). Each device shows last seen and online status. «Անջատել» revokes it immediately.

### 13. Sales dashboard

Today first, in the order owners ask for them (`docs/00-research/video-notes.md`, A1 and A2): average bill, revenue, number of orders, then the best and the weakest dishes. Then the hour-by-hour chart compared with the same weekday last week, top dishes by count and revenue, orders by source (QR vs waiter), average time from order to ready per station, cancellations with reasons. A date range for past days. Numbers come from closed bills; open tables are shown separately as «Բաց սեղաններ».

| State | Behaviour |
|---|---|
| First day | «Առաջին պատվերից հետո այստեղ կերևան վաճառքները։» |
| Partial day | A clear "so far today" label; comparisons use the same time of day. |

### 14. Telegram

«Միացնել Telegram» opens a link to the bot with a one-time code. Shows connected chats, which events each gets and their language. By default only exceptions: late orders, a screen offline, a dish cancelled after serving, and the end-of-day summary; every new order is a switch, off by default (ADR-040). A "send test" button.

### 15. Settings

Café details, logo and brand colour (contrast checked live against white and against ink), guest languages, kitchen language, "confirm every QR order", auto-accept limit, business day start, late thresholds for the kitchen.

---

## Platform admin

### 16. Restaurants and subscriptions

A list of restaurants with location count, plan, trial end, last order, and health (last order today, devices online). Detail view with subscription status, notes, and a support log. Read-only access to a café's data for support, logged in the audit log.

### 17. Delivery problems

Dead-lettered Telegram messages, failed menu imports, and devices offline for more than a day during opening hours.
