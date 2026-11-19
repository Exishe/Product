# Pativ («Պատիվ»): product overview

State as of 19 November 2026. "Restaurant OS" is the internal project name; guests and cafés see **Pativ**.

## In one paragraph

Pativ is an Armenian-first cloud platform for independent cafés and small restaurants in Yerevan: places with 8–25 tables and table service that today run on paper. A guest scans the QR code on the table, reads the menu in Armenian, Russian or English and orders from their own phone. The waiter's phone and the kitchen screen see the order within seconds, and the owner follows the evening from an admin panel and Telegram. A café can set up its whole menu from a photo of its paper menu. Nothing has to be installed: everything runs in the browser on phones, tablets and computers.

## Who uses it, and what each one gets

### Guest (phone, no app, no sign-up)

- **Scan and open the menu.** Each table has its own signed QR code. A wrong or old code shows a friendly "ask your waiter" page.
- **Read the menu in hy / ru / en.** It has dish photos, tag badges (popular, spicy, vegan, new), portions, sold-out marks and search that works in all three scripts. The header shrinks while scrolling.
- **Choose and order.** Each dish opens with its options (size, extras). The cart has notes per dish. The order is protected against double taps and lost connections.
- **Call the waiter or ask for the bill**, even before ordering. The bell button rings with an animation. When asking for the bill, the guest says whether they'll pay by card or cash.
- **Follow the order live:** Received, then Accepted, Cooking, Ready, Served.
- **"Tell me when it's ready"** notifications on the phone (web push).
- **Play while waiting.** Five small, funny café games open right from the order page:
  - **Waiter Run:** run down a Yerevan street, jump chairs and slide under awnings without spilling the coffee.
  - **Kitchen Clash:** two cooks in a food fight with a spoon, a frying pan and tomatoes.
  - **Kissing Dishes:** food with faces merges from a bunch of greens up to a festive table.
  - **Salad Panic:** slice the panicking vegetables, but not grandma's teapot.
  - **Café Cat:** the café cat sneaks through the kitchen to steal the chef's fish.

  The games have cartoon voices and sound effects (off by default). When the food is ready a banner pauses the game so the guest doesn't miss it.

### Waiter (phone)

- Floor map of the tables with their state: free, ordered, waiting, calling, bill.
- Accept or reject QR orders, cancel a line, mark dishes as served.
- Take an order by hand on the order pad. It works on weak Wi-Fi: orders queue and send themselves when the connection returns.
- See and close "call waiter" and "bill" requests.
- Settle the table, recording whether the guest paid in cash or by card terminal.
- Push notifications for new orders and calls.

### Kitchen (tablet or screen)

- A board with New, Cooking and Ready columns and a timer on every ticket.
- Start-of-shift mode keeps the screen awake with sound on.
- Stop list: mark a dish as sold out and it disappears from the guest menu at once.
- A "kitchen is busy" switch shows guests a warning.
- Works through short connection drops, and a heartbeat tells the owner if a screen goes offline.

### Owner / manager (computer or phone, `/admin`)

- **Sign-up and set-up** of a new café.
- **Menu editor:**
  - categories, dishes, prices, photos and translations into three languages;
  - option groups (sizes, extras);
  - stop list, and publishing changes.
- **Menu from a photo:** upload a photo of the paper menu. AI (Google Gemini, free tier) reads it, the owner reviews and fixes it, and it becomes the menu.
- **Tables and QR codes:** add tables and print QR cards, four per A4 page. Reprinting a card invalidates the old code.
- **Staff:**
  - invite waiters and cooks;
  - connect kitchen screens with a pairing code;
  - remove access.
- **Telegram alerts** for orders and calls, and an evening summary.
- **Sales dashboard:** orders, revenue and popular dishes.
- **CSV export** of orders and sales.
- **Plan banner:** shows which plan the café is on and what it includes.

### Platform team (`/platform`)

- A list of all cafés with their plan and health; change a café's plan.
- See failed background messages (Telegram, push) and fix them.

## How it's built

- **Web app:** Next.js 16 (React 19, TypeScript, Tailwind) on **Vercel**. It is one app for guests, staff, owners and the platform team.
- **Database and back end:** **Supabase**, using Postgres, sign-in, Realtime live updates, file storage, scheduled jobs and Vault for secrets.
  - All business rules live in the database.
  - Every table is protected by row-level security, so each café only ever sees its own data.
  - The app never holds the database master key.
- **Live updates:** Supabase Realtime, with a polling fallback when a connection is weak.
- **AI:** Google Gemini, free tier, used only for reading menu photos.
- **Languages:** Armenian (default), Russian and English: 750 interface texts in each.
- **Quality:**
  - automatic checks on every change: lint, types, about 300 unit tests and database tests;
  - browser tests run at phone, tablet and desktop sizes;
  - a license audit and a dependency audit;
  - a security review was done on 10 Nov 2026 with no critical or high findings; the two medium findings are fixed.
- **Cost today:** everything runs on free plans (Supabase Free, Vercel Hobby, Gemini free tier, GitHub Actions), as the owner instructed.

## Where it lives

| What                             | Where                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Production (live)                | https://pativ.vercel.app, with the guest menu improvements                                                         |
| Preview (latest work, protected) | https://pativ-git-claude-new-session-qjsyvc-sroondz.vercel.app — new games, games strip, menu redesign in progress |
| Database                         | Supabase project `restaurant-os-dev` (Frankfurt, free plan)                                                        |
| Demo café                        | `demo-cafe`, table 1                                                                                               |

New work always goes to the preview first; production only on the owner's "go".

## Business model (decided 9 Nov 2026)

| Plan        | Price                                              | What's included                                                                                                        |
| ----------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Menu**    | Free, forever                                      | QR menu in 3 languages, menu from a photo, stop list, a small "made with Pativ" link                                   |
| **Service** | 15,000 ֏ / month per location, or 150,000 ֏ / year | Everything in Menu, plus ordering, waiter and kitchen screens, Telegram, dashboard, no Pativ link, support in Telegram |

- **Trial and set-up:** a 30-day free trial with no card. No set-up fee, and in-person set-up is free for the first 50 cafés.
- **Founding cafés (first 10):** free during the pilot, then 10,000 ֏ / month locked for 12 months.
- **Terms and billing:** month to month, with a seasonal pause of up to 3 months a year. Billing is by invoice in AMD, because Stripe doesn't work in Armenia.

**Positioning.** Guests order from their own phone in their language, the kitchen sees it in seconds, and the owner follows the evening in Telegram. Set-up takes an evening, from a photo of the paper menu.

**Competitors.** Pativ is cheaper and simpler than iiko (24,000–47,500 ֏ per cash desk), and it does more than menu-only QR services (GisMenu, Bonee, OddMenu).

**Not a fit today.** Cafés that need fiscal receipts (HDM), stock control or online payment, and cafés already running iiko.

**Go-to-market:**

1. Visit 20 cafés in Kentron.
2. Run 3 pilot cafés for about 8 weeks.
3. Grow to 10 cafés and write a case study.
4. Grow to 50 through referrals, street-by-street visits and the free Menu plan.

No paid ads.

**Targets.** 10 cafés live with 3 paying by month 3, and 50 paying (750,000 ֏ / month) by month 9.

**Main success measure.** Real orders per café per open day, with a pilot target of 30 by week 4. Other targets:

- At least half of orders come through QR.
- An order reaches the kitchen screen in 2 seconds or less.
- Waiters accept an order within 2 minutes.

## What's not built yet (later stages)

These are prepared in the database design but have no screens yet:

- **Stage 2:** shifts, receipt printers, per-waiter statistics.
- **Stage 3:** online payments through an Armenian provider (Ameriabank vPOS or ArCa), and delivery.
- **Stage 4:** stock and food cost, loyalty, an AI assistant for owners.

Fiscal receipts (HDM) are deliberately out of scope; cafés keep their existing cash register.

## Waiting on the owner before real cafés

- **Keys and secrets:**
  - the Gemini API key in Vercel, to switch on "menu from a photo" live;
  - the Telegram bot token, for owner alerts;
  - Cloudflare Turnstile keys, for anti-bot protection on guest sign-in.
- **Backups:** a database password for the nightly backups, and one restore test.
- **Two-factor sign-in** on the owner's accounts.
- **Spending that needs the owner's approval:**
  - Vercel Pro before the first paying café; the free Hobby plan is non-commercial only;
  - Supabase Pro at about 5 cafés;
  - a domain name (about $15 a year).
- **Business set-up:**
  - a bank account for invoices;
  - company details (name, TIN, VAT);
  - a lawyer's review of the terms;
  - a support phone number and Telegram contact.

## New on 19 November 2026 (preview only)

Built by parallel lanes and merged together; the decisions are ADR-057 to ADR-063.

- **Each café's own look (ADR-058).** On top of the theme an owner sets, in `/admin/look`, up to five brand colours with fixed jobs (header, accent, badges, lines, page), title, text and script fonts from 28 free Google fonts (all but one with Cyrillic), the plate style (white porcelain, dark, none), a wordmark picture in two versions, for light and for dark backgrounds (ADR-065; the page picks the one that reads, also in the slim bar that stays while the menu scrolls), and a wide cover photo per menu section. The editor shows each colour's contrast and ignores a colour on the guest page when text would be hard to read. A café without a brand looks exactly as before.
- **Guest menu (ADR-060, ADR-061).** Sections with few photos read as a printed menu instead of rows of empty plates. Dishes list their allergens, and an "Allergies" filter marks dishes that contain what the guest avoids (it never calls a dish safe). "Order the same again" and "Last time here" bring back an earlier order. The bill can be split evenly. "Often ordered with this" and "Usually ready in 10–15 min" come from the café's own orders. The rotating section word and the star-trail buttons are gone.
- **Waiter (ADR-063).** A timeline per table, how long each table has waited, a "quiet table" cue after 20 minutes, quick actions in the Orders and Calls lists, a visible queue of taps waiting to be sent while offline, and «Իմ հերթափոխը», the waiter's own shift summary.
- **Kitchen (ADR-062).** A red allergy banner when a note mentions an allergy, different sounds for a new order, a cancellation and an allergy order (with a pitch per screen), an all-day count of each dish still to cook, and striking dishes one by one.
- **Owner admin (ADR-057).** A new home with today's revenue, orders, open tables and a to-do list; a cost price per dish (owner only); and a menu analysis page that sorts dishes by how often they sell and how much they earn, with a busy-hours table.
- **Games (ADR-059).** Still plain canvas, no game engine: the games lower their resolution on slow phones, stop in a hidden tab, use no emoji, and take the café's colours.
- **Database:** three migrations (`guest_hints`, `menu_insights`, `brand_profile`) reach the dev database through the CI `migrate` job after the push. Until then those features stay hidden or show a notice.

## In progress right now

- **Guest menu redesign, on preview only:**
  - full-screen layout on computers and tablets as well as phones;
  - three looks each café picks in its admin («Հյուրի էջի տեսքը»): Pure (recommended: the owner's reference look, light grey, floating white cards, dishes on dark plates, one amber accent), Evening (noir and champagne) and Wine (dark wine with one red), plus the café's own brand colour and logo;
  - dishes as cards on round plates, a featured dish per section, an order panel beside the menu on computers;
  - a floating bottom bar: menu, order, games, call the waiter;
  - the Stardom display font and three small effects (letters rising in, cards tilting under the finger, a spark when adding).
- **One look for the whole platform (ADR-056), on preview only:** the waiter app, the kitchen board (now light), the owner admin, sign-in and sign-up follow the same Pure look: grey page, floating white cards, light serif titles, black pill buttons.
- **Production:** the games and the redesign go to production when the owner says "go".
