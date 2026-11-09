# Gaps: what no reference does well, and where we can win in Armenia

This file builds on `reference-analysis.md`. Each gap names the best reference we found, what is still missing, and what we do about it. Claims about the Armenian market that we have not verified yet are marked [verify in Phase 5].

## Quick view

| What a Yerevan café needs | Closest reference | What's missing | Our answer |
|---|---|---|---|
| Menu and UI in Armenian, Russian and English | FeastQR (translation tables, en/pl) | No reference ships Armenian; none translates content automatically | hy-first UI, menu content in three languages, translated by Claude and reviewed by the owner |
| Guest orders in English, kitchen reads Armenian | none | Every reference keeps one name per item, or only the guest's language | Order lines snapshot all three names; each screen shows its own language |
| Armenian on the receipt printer | ReceiptPrinterEncoder | No Armenian codepage | Render Armenian lines as images (Stage 2) |
| A café gets set up without an IT person | eatlah's import idea | eatlah's public AI is a stub; the others need Docker or ERPNext servers | Photo of the paper menu → reviewed digital menu in under 30 minutes |
| Owner hears about orders where they already are | none | None of the nine sends Telegram alerts | grammY bot: new orders, overdue orders, end-of-day summary |
| Many cafés on one platform, safely | FeastQR (RLS on, but no policies) | Single-tenant installs or app-level filters | Postgres RLS on every tenant table from the first migration |
| QR that can't be abused from a photo | URY (HMAC + session) | nodedr's token never changes; FeastQR and menufic are view-only | Signed table token → short session → rate limits → idempotent submit |
| Pay by card or wallet online | Ameria vPOS guide | No reference integrates an Armenian provider | Stage 3, starting with Ameriabank vPOS or ArCa |
| Kitchen screen readable from 2 m | mosaic | Small text, mixed grid, hidden buttons, once-a-minute timer | Our own KDS spec (see `reference-analysis.md`, mosaic) |
| Keeps working on bad café Wi-Fi | nodedr (LAN server) | A LAN server doesn't fit a cloud product | Client outbox + idempotency + visible offline state |
| A price a small café will pay | none | Free but self-hosted, or Toast-style contracts | 10,000–20,000 AMD per location per month, no new hardware |

## 1. Armenian first, not Armenian as an afterthought

None of the nine references supports Armenian. nodedr has en/es/fr, FeastQR en/pl, eatlah zh/en and menufic en. Only FeastQR stores menu content per language, and its owners type every translation by hand.

What an Armenian-first product has to get right, and the references never had to:

- Content in three languages from day one. Every item, category, modifier and description has hy, ru and en text. A missing translation falls back visibly (to hy, then ru), never to an empty string.
- Kitchen language ≠ guest language. A tourist orders in English; the cook reads Armenian or Russian. Order lines must keep the item name in all three languages so the KDS, the waiter app and later the printer each show their own.
- Typography. Reformed spelling, Armenian punctuation (։ ՝ ՞ « »), `lang="hy"` so the browser hyphenates and picks fonts correctly, and fonts with full Armenian glyphs. Many Latin display fonts have none, and a page that silently falls back to a system font for Armenian looks broken. Every font gets checked against Armenian text before it's chosen (Phase 3).
- Money format. AMD has no coins in everyday use, so prices are whole numbers shown as `1 500 ֏` (or `1 500 դր.`; to be decided in `i18n.md`). Store integers; never floats or strings (menufic stores text, eatlah floats).
- Search that forgives. Guests may type "khorovats", "хоровац" or "խորոված". Menu search should match all three scripts. None of the references has menu search at all.
- Thermal printers. No Armenian codepage exists in ReceiptPrinterEncoder's data, and cheap printers don't ship one. Stage 2 prints Armenian as rendered images; Russian can use cp866 or windows-1251 natively.

This is our clearest advantage: a foreign product could add Armenian strings, but doing it properly touches the data model, fonts, printing and AI prompts.

## 2. AI onboarding that actually exists

eatlah is the only reference with the "photograph your paper menu" idea, and its public code returns four hard-coded dishes. Nobody in the list does extraction plus translation plus review.

Our version:

1. The owner takes a photo (or several) of the paper menu. The browser downscales it to about 1600 px before upload (eatlah's trick, which also cuts API cost).
2. Claude with vision returns strict JSON: categories, items, prices in AMD, descriptions, modifiers, a confidence value per field, and the source language.
3. Zod validates it. Anything that fails goes back for one retry, and then to the owner as "couldn't read this line".
4. Claude translates into the two missing languages, following our Armenian style rules.
5. The owner reviews everything in one screen, with low-confidence fields highlighted. Nothing is published until they press publish.

Real Yerevan menus mix Armenian, Russian and English, use handwritten boards and write prices as "1500", "1.500" or "1500 դր.". We should collect 15–20 real menu photos from cafés and measure extraction accuracy before promising "five minutes" in sales material [collect in Phase 4/6].

## 3. Telegram where the owner already is

None of the nine analysed repos sends Telegram alerts. URY uses Frappe's in-app notifications, and nodedr has none. (pronto, not analysed, has Telegram reminders for bookings.)

Small café owners are often not on site. For them, a Telegram message per new order, a ping when an order waits too long in the kitchen and a short end-of-day summary are worth more than a dashboard they open once a week. The same bot can be the support channel (`support.md`, Phase 4). Whether owners prefer Telegram, Viber or WhatsApp is [verify in Phase 5]; we build Telegram first because the brief asks for it and grammY makes it cheap.

## 4. Real multi-tenancy and safe guest ordering

Every reference is either installed once per restaurant (nodedr, URY, TastyIgniter) or filters by owner in application code (menufic, FeastQR). FeastQR switches RLS on but writes policies only for profiles and storage, so its data tables rely on the app being correct.

We are a SaaS from day one, so:

- RLS on every tenant table, with integration tests proving café A cannot read café B (brief, Phase 6).
- Guests never get a database role with broad access. They hold a signed table token, which opens a short ordering session, as URY does it. The server re-prices every order from the published menu.
- Rate limits per table and per IP on public endpoints, and an idempotency key on every order submit (nodedr has one on the kiosk path but not on the QR path).
- A rotation story for QR tokens, so a photo of a sticker taken last month can't place orders from home.

## 5. Local payments (Stage 3)

No reference integrates an Armenian provider, and the banks publish no official open-source SDKs (`resources.md`, section 5). The Ameria guide shows what we'll face: a hosted payment page, no webhook, no signature, and an `OrderID` that must be unique per attempt. So we need server-side verification after every redirect, plus a reconciliation job for guests who never come back. Each café will probably need its own merchant contract, which adds onboarding friction; a platform or sub-merchant agreement with one bank would remove it [ask the bank in Stage 3].

In Stage 1 guests pay the waiter, as today. The data model still includes `bills` and `payments` so Stage 3 doesn't need a migration of old orders.

## 6. Price and setup effort

The references are either free but self-hosted (nodedr wants a LAN server or Docker; URY needs a full ERPNext install) or commercial products built for other markets. Toast, the product we're modelled on, lists the US, Canada, the UK, Ireland, Australia and New Zealand as its markets ([Toast Go 3 launch](https://pos.toasttab.com/news/toast-go-3-handheld-pos-global-launch), [Toast UK](https://pos.toasttab.com/uk/international-expansion)), not Armenia.

Our wedge: a monthly fee in the 10,000–20,000 AMD range, guests use their own phones, and the café uses the tablets, old phones and thermal printer it already has. Which local QR-menu and POS products a Yerevan café already uses, and what they cost, is Phase 5 research [verify in Phase 5].

## 7. Smaller gaps we design for anyway

- Kitchen screen. mosaic shows what not to do: small text, one mixed grid, controls hidden behind a tap, a timer that updates once a minute. Our KDS uses columns by state, huge table numbers and per-second timers (spec in `reference-analysis.md`).
- Offline on a cloud product. nodedr dodges the problem with a server in the café. We can't, so we need an outbox on waiter and kitchen devices, idempotent writes, a visible "offline, 3 actions waiting" state, and a paper fallback for long outages. Read FloCafe before writing `realtime.md`.
- Live order status for guests. eatlah polls every 5 seconds; we use Supabase Realtime with a polling fallback.
- Status history. TastyIgniter records who changed what; nodedr's audit log has no tenant column. Ours has both.

## 8. Risk: fiscal receipts (HDM)

None of the references deals with Armenian fiscal rules. Retail sales in Armenia go through cash register (HDM) receipts registered with the State Revenue Committee, and the SRC fines violations: 729 cases and AMD 189.5 million in January 2024 alone ([ARKA](https://arka.am/en/news/business/src_imposes_fines_worth_189_million_drams_for_violation_of_cash_register_/), [hartak.am](https://english.hartak.am/services/164c1210-1b00-4aad-8683-0aa777ba1ee6/online/)).

Stage 1 doesn't touch money, so it's not affected: the café keeps its HDM exactly as now. Stage 2 (bills and printed receipts) must not look like a replacement for the fiscal receipt unless we integrate with HDM. Before Stage 2, we need an Armenian tax adviser's answer on what a POS that prints bills must do [verify before Stage 2].

## What we deliberately don't compete on in Stage 1

Inventory and recipes, payroll, procurement, accounting, reservations, delivery and loyalty. The references show how big these get (nodedr has about 100 models), and none of them is why a café in central Yerevan would switch from paper. They stay in Stages 2–4, and the Phase 1 schema leaves room for them.

## Sources

- Toast markets: [Toast Go 3 global launch](https://pos.toasttab.com/news/toast-go-3-handheld-pos-global-launch), [Toast UK, international expansion](https://pos.toasttab.com/uk/international-expansion), [Toast enters Canada](https://pos.toasttab.com/news/toast-enters-canada)
- Armenian cash register rules: [ARKA, SRC fines for cash register violations (2024)](https://arka.am/en/news/business/src_imposes_fines_worth_189_million_drams_for_violation_of_cash_register_/), [hartak.am, HDM registration](https://english.hartak.am/services/164c1210-1b00-4aad-8683-0aa777ba1ee6/online/), [beancount.io, Armenia e-invoicing guide (2026, secondary)](https://beancount.io/blog/2026/10/03/armenia-e-invoicing-turnover-tax-trade-manufacturing-guide)
- Everything else: the cloned repos, cited in `reference-analysis.md`.
