# Pilot checklist: three cafés, eight weeks

An ordered checklist for running the pilot in `go-to-market.md` (step 1). It doesn't repeat the minute-by-minute setup in `onboarding-a-cafe.md` or the metric definitions in `metrics.md`; it says what to do, in what order, and what to tick off. Prices and terms are in `pricing.md`; the legal drafts are in `legal/`.

Free-only rule: nothing here costs money. Items that would are in the last section and wait for the owner.

## 0. Before choosing the cafés

- [ ] Field visits done (go-to-market, step 0); `docs/00-research/field-notes.md` has a ranked list of candidates.
- [ ] Pick 3 cafés that fit: interested owner, 30+ orders on a normal day, table service, some tourists, usable Wi-Fi, a spare tablet or old phone, no POS for orders (iiko or similar).
- [ ] Hosting fits: three cafés is the most the free plans carry (`costs.md`). Don't add a fourth.
- [ ] The Terms and Privacy drafts (`legal/terms*.md`, `legal/privacy*.md`) are filled with the real company details, or the owner has decided the pilot runs on a short written agreement and the lawyer review waits for the first paying café. This is the owner's call.

## 1. Before the visit

Ready on our side:

- [ ] Preview link works on a phone and on a tablet (the Vercel preview of the session branch; it is protected, so the café's devices need the share link or a bypass, or open it ourselves on the visit). Test it on mobile data, not only on our Wi-Fi.
- [ ] Demo café «Դեմո սրճարան» is live on that preview, with a working kitchen screen and a second phone ready to play the kitchen.
- [ ] Demo QR card printed (one table), so the owner can scan it in the first five minutes.
- [ ] Printed one-pager in Armenian and Russian (`pitch-onepager.md`), with the contact slot filled in.
- [ ] Pricing card with the decided prices (`pricing.md`): Menu free, Service 15,000 ֏ a month, founding price 10,000 ֏ for 12 months after the pilot, no lock-in, seasonal pause.
- [ ] The pilot agreement or the Terms (`legal/terms.hy.md`, `terms.ru.md`) printed or ready to send in the café's language.
- [ ] **Consent to publish numbers**, in writing (a message in their Telegram chat is enough for the pilot): the café agrees that we may publish its numbers (orders per day, QR share, kitchen time, language mix) and a quote as a case study, and that it can withdraw before publication. Without it the café is not in the founding offer.
- [ ] Consent to photograph the paper menu for the AI import, and to keep those photos as a test set outside the repo.
- [ ] Onboarding kit from `onboarding-a-cafe.md`: portable printer or the café's, A4 sticker paper, table stands if wanted, paper order pads, laminated paper-fallback card.
- [ ] The owner's call the day before (10 minutes): paper menu or price list, number of tables and how they're numbered, languages, owner email and Telegram, a kitchen tablet with a charger, Wi-Fi name and password, logo file.
- [ ] Support chat: a Telegram group per café created, with the owner and us.

## 2. Setup visit (about 30 minutes, plus 5 for staff)

Follow `onboarding-a-cafe.md` to the minute and write down every step that takes longer than the runbook says. In order:

1. [ ] Sign up on the owner's phone or our laptop: email, password, café name, address. Confirm the email.
2. [ ] Menu: photograph the paper menu (1 to 8 photos) for the import, or enter the 10 best sellers by hand if the photo or the AI service fails. Tell the owner that Google's free AI tier may use menu photos to improve its products (it's in the Privacy notice); nothing private on the photos.
3. [ ] **Review the translations** with the owner, line by line. The owner reads Armenian; for Russian and English ask someone who reads them, or the owner's staff. Check every price and flagged row. Nothing is published unreviewed (Terms, section 6).
4. [ ] Tables: enter the count and areas so they match the numbers on the real tables.
5. [ ] Publish the menu; open it as a guest in all three languages.
6. [ ] Print the QR cards (4 per A4 sheet) and place them. Scan two from a guest's seat with the lights at their evening level.
7. [ ] Pair devices: kitchen tablet, bar if separate, waiter tablets or phones (6-digit code, valid 10 minutes). On each: auto-lock off, volume to maximum, add to home screen, tap «Սկսել հերթափոխը».
8. [ ] Telegram: link the owner's Telegram, send the test message. If the owner uses Viber and not Telegram, set up web push instead and note it (go-to-market, risks).
9. [ ] Staff, 2 minutes each: the waiter app has four buttons (accept, served, call, close table). Name one champion per shift.
10. [ ] **Test order end to end**, marked «Փորձնական»: scan table 3, order one kitchen item and one bar item; check the kitchen slip arrives within 2 seconds, kitchen taps «Սկսել» then «Պատրաստ է», the waiter marks it served and closes the table with «Կանխիկ».
11. [ ] Fallbacks: the hotspot phone and its name saved on the kitchen tablet; the paper pack in the bar drawer.
12. [ ] Tell the owner: the café keeps its register and prints HDM receipts as before; Pativ issues no fiscal receipts and takes no payments. Show where to export the menu and sales to a spreadsheet.
13. [ ] Leave: the support chat, the phone number for "service is stopped", and the date of the first Friday visit.

Same evening and next morning:

- [ ] Watch the first service from the platform admin; message the owner if orders stall.
- [ ] Next morning: send the champion a one-page guide per role (waiter, kitchen, owner) in Armenian and Russian.
- [ ] Next day: a short call. What confused staff, what guests asked.

## 3. First Friday evening (week 1, 19:00 to 22:00)

- [ ] We are on site before 19:00. Check that every device shows the green connection label.
- [ ] Charge check: all tablets plugged in.
- [ ] Scan a QR card ourselves at 19:00 to confirm the flow.
- [ ] Watch where staff hesitate. Write down the moment, not the opinion.
- [ ] Don't ship anything during service. Fixes go out in the quiet hours (before 11:00), never on Friday or Saturday evening.
- [ ] Note: lost or duplicate orders, order-to-kitchen delays, guests who gave up on the QR, Wi-Fi drops, and what the paper fallback did.
- [ ] After closing: five minutes with the owner and the champion. Then the Telegram day summary is checked against what they say happened.

## 4. Weekly call (weeks 2 to 8, 15 minutes per café)

Open the numbers from the platform admin before the call. Agenda:

- [ ] Orders per open day, and the split between QR and waiter orders.
- [ ] QR share, and the language mix (hy, ru, en).
- [ ] Kitchen time, and the share of tickets over 20 minutes.
- [ ] Order to kitchen screen: p95 against the 2-second target; any lost order.
- [ ] Anything that broke, and what is fixed. Fixes ship in the quiet hours.
- [ ] Their questions and requests; staff changes (new waiter to pair, a device to remove).
- [ ] A quiet-café check: fewer than 5 real orders a day for several days means a call that week, not at week 8.
- [ ] Write the notes in the café's support chat so the owner sees them, and in `docs/00-research/field-notes.md` (no personal data beyond the café name and role).

## 5. Week-8 decision call

- [ ] Prepare per café: activation (published menu, paired kitchen screen, 20 real orders on 3 different days in week 1), orders per open day, QR share, kitchen time, support threads, and every incident.
- [ ] Ask each owner: will you pay 10,000 ֏ a month (founding price, locked 12 months)? What would make it a clear yes? What would you remove?
- [ ] If yes: agree the invoice details and [bank account] with the owner, and note the first invoice date. Starting to charge also starts paid hosting (see section 6), so the owner decides when.
- [ ] If no: the café stays on the free Menu plan. Record the reason in the café's own words.
- [ ] Ask for the case-study quote and re-confirm the consent to publish, with the final numbers.
- [ ] Decide whether to go to ten cafés. Go when all three hold:
  - 2 of 3 cafés activated and still using it on Friday nights in week 8;
  - p95 order to kitchen screen of 2 seconds or less, with no lost orders;
  - at least 2 of 3 owners say they will pay.
  If not, find out why before adding cafés.

## 6. Owner tasks still open

These need the owner. Nothing below is started without their word, because each costs money, needs an account, or is a decision.

| Task | Needed for | Status |
|---|---|---|
| Gemini API key (free tier) | AI menu import and translation in the preview | Open |
| Telegram bot: create it with BotFather, paste the token once in the admin (Vault) | Owner alerts and day summary; web push covers the gap if it waits | Open |
| Cloudflare Turnstile keys (free) and switch on CAPTCHA in Supabase Auth | Bot protection on anonymous guest sign-in. Raise the anonymous sign-in limit to about 300 per hour at the same time | Open |
| Vercel plan that allows commercial use (Pro, about $20 a month) | **Before the first café pays.** Hobby allows non-commercial use only, which covers a free pilot | Decision when the first café agrees to pay |
| Supabase Pro ($25 a month) | Backups, and room beyond a few cafés. Free has no backups (a nightly dump runs meanwhile) and hits limits around 5 cafés; take Pro at about 5 cafés, or when a café depends on it daily | Decision at about 5 cafés |
| Domain (about $15 a year) | The landing page, free sign-up, and sending sign-up emails from our own domain | Waits for the free-only rule to change |
| Bank account for invoices | First invoice | Owner's decision |
| Company details: name, address, TIN, VAT regime | The Terms, the Privacy notice, invoices | Open |
| Armenian lawyer review of `legal/` | **Before the first paying café** | Open |
| Accountant: VAT and invoicing, and an adviser on HDM before Stage 2 | First invoice; Stage 2 | Open |
| Support phone number and Telegram handle | One-pager, support, Terms | Open |
| Logo (wordmark) | QR cards, one-pager | Phase 6 |

## 7. What to measure

Definitions and queries are in `metrics.md`. For the pilot, in short:

| Number | Target for the pilot |
|---|---|
| Real orders per café per open day | 30 by week 4 |
| QR share | 50 % by week 4 (below 30 % after a month: lead with the waiter app) |
| First-week activation | 2 of 3 cafés |
| Time to first order | Under 3 days |
| Order to kitchen screen, p95 | 2 seconds or less, no lost orders |
| Waiter acceptance wait, p90 | 2 minutes or less |
| Kitchen time, and tickets over the café's limit | Measured, shown to the owner |
| AI import: rows changed before publishing; price changes | Price changes under 2 % |
| Language mix of QR orders | Measured: the proof for tourists |
| Support threads per café | Under 2 per café per month after month 1 |
| Incidents (S1, S2) and minutes to first response | Written up within 24 hours (`support.md`) |
| Would they pay, and at what price | 2 of 3 yes at the founding price |

Also write down by hand, because no system measures it yet: every step that took longer than `onboarding-a-cafe.md` says, every question a waiter asked twice, and what guests said about the QR.
