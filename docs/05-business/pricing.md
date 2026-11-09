# Pricing

Decided on 9 Nov 2026: the owner delegated the Gate 5 decisions, and the recommended option B was taken as it stands (see "Decisions" at the end). This file keeps the options and the reasons. All prices are per location per month, in AMD. Competitor prices were checked on 9 Nov 2026; 1 USD = 360.43 AMD (Central Bank of Armenia, same day).

## What cafés pay elsewhere

| Product | Price per month | What it includes | Source |
|---|---|---|---|
| iiko, Armenian branch | 24,000 ֏ (START, small cafés), 38,500 ֏ (PRO), 47,500 ֏ (ENTERPRISE), per cash desk | Full POS and back office. Hardware and setup not listed | [iikosoftware.am](https://iikosoftware.am/) |
| QR Menyu (Azerbaijan) | Free up to 50 dishes; $6.47 ≈ 2,330 ֏ for unlimited, with POS, kitchen display and tables; $70.59 a year | QR menu, ordering, waiter and kitchen screens. Billed in AZN; not sold in Armenia | [qrmenyu.az](https://qrmenyu.az/en) |
| GisMenu (Armenia) | E-menu free; other prices not published | E-menu, e-ordering, loyalty | [bouncewatch.com](https://bouncewatch.com/company/gismenu) |
| MenuTiger (global) | $0, $17, $46, $119 ≈ 0–42,900 ֏ | QR menu; table ordering appears only on the top plan | [menutiger.com/pricing](https://www.menutiger.com/pricing) |
| Mersoft, Norksys (Yerevan) | Not published | Restaurant POS; Mersoft prints HDM receipts | `positioning.md` |
| Paper menu | Reprint cost on every price change | Nothing else | — |

Two things follow. A view-only QR menu is worth nothing as a paid product: GisMenu and QR Menyu give it away. And iiko's cheapest plan, 24,000 ֏ per cash desk, is the price a Yerevan owner will compare us with when they think "restaurant software".

## What 15,000 ֏ means to a café

- About 5–10 % of one cook's monthly pay: Paylab gives 147,103–298,076 ֏ for cooks in Armenia ([paylab.com](https://paylab.com/am/salaryinfo/tourism-gastronomy-hotel-business/cook?lang=en)).
- Less than one dinner for two at a mid-range place (19,000 ֏) or about four cheap meals (4,000 ֏ each) on Numbeo, November 2026 ([numbeo.com](https://www.numbeo.com/cost-of-living/in/Yerevan)).
- 62 % of iiko START, with nothing to install and no cash desk to buy.

## Our cost floor

From `costs.md`: 1,698 ֏ per café a month at 10 cafés, about 820–850 ֏ at 50–200. The fixed part is about 16,800 ֏ a month (Supabase Pro and Vercel Pro), and it starts with the first paying café, because Vercel's free plan doesn't allow commercial use. Two paying cafés cover it at any price from 10,000 ֏ up. Our own time costs far more than servers, so the price has to pay for in-person setup and support, not just hosting.

## Options

### A. One plan, one price

Everything in Stage 1 for 15,000 ֏. The first month is free. No free plan.

- For: the simplest thing to explain at the counter.
- Against: a café that only wants a menu in three languages has no way in, and those cafés exist; GisMenu and QR Menyu serve them for free.

### B. Free menu, paid service (recommended)

| | Ճաշացանկ / Menu | Սպասարկում / Service |
|---|---|---|
| Price | Free, no time limit | 15,000 ֏ a month; 150,000 ֏ a year if paid upfront (two months free) |
| QR menu in hy / ru / en, search in three scripts | Yes | Yes |
| Menu import from a photo, with review before publishing | Yes | Yes |
| Stop list ("not today") | Yes | Yes |
| Guest ordering, live order status, call the waiter, ask for the bill | — | Yes |
| Kitchen and bar screens, waiter app, table map | — | Yes |
| Telegram alerts and day summary | — | Yes |
| Sales dashboard | — | Yes |
| Support | Help articles | Telegram chat; phone when service is stopped |
| Small "made with" link on the guest menu | Yes | No |

- For: matches the free menus already on the market and turns them into a way in. A Menu café that later wants ordering upgrades in the admin without setting anything up again. A menu-only café costs us almost nothing to run: guests who only read the menu don't sign in, so they don't count toward Supabase's monthly active users (`costs.md`).
- Against: some cafés will stay free forever. That's acceptable if the Menu plan stays self-service.

### C. Two sizes

Small (up to 10 tables) 12,000 ֏, Standard 18,000 ֏.

- For: a bigger place pays more.
- Against: table count doesn't track value well (a 6-table café with a terrace queue may be busier than a 15-table one), and it adds a question to every sales conversation. Revisit in Stage 2, when the POS gives us something per-terminal to price.

## Why 15,000 ֏ and not 10,000 or 20,000

- At 20,000 ֏ we're too close to iiko START, which includes a full POS with bills, stock and HDM receipts. Stage 1 has none of those.
- At 10,000 ֏, 50 cafés bring 500,000 ֏ a month. That doesn't pay for one person doing sales, setup and support full time; the average gross wage in Armenia was 303,140 ֏ in 2025 ([ARKA](https://arka.am/en/news/economy/average-monthly-salary-in-armenia-increased-by-5-6-in-2025/)).
- 15,000 ֏ leaves room to add the Stage 2 POS later as a higher plan (for example 20,000–22,000 ֏), still under iiko.
- QR Menyu shows a regional tool can sell ordering and a kitchen screen for about 2,330 ֏. We can't win on price against that, and we shouldn't try. We win on Armenian done properly, setup in person, Telegram, and someone in Yerevan who answers.

## Free month, setup fee, founding cafés

- Free month: every new location gets Service free for 30 days, no contract and no card. On day 25 the owner gets a Telegram message with their own numbers (orders, QR share, kitchen time) and the first invoice. If they don't pay, the location falls back to the Menu plan: the menu keeps working, ordering turns off, nothing is deleted. The schema already starts every location as `trialing` with `trial_ends_at` 30 days out.
- Setup fee: none. In Yerevan we set up in person, free, for the first 50 cafés. The café prints its QR cards from the PDF the admin gives it; we don't resell stands.
- Founding cafés (the first 10): Service is free during the pilot, then 10,000 ֏ a month locked for 12 months, in return for a weekly 15-minute call, honest feedback and permission to publish their numbers and a quote as a case study.
- Several locations: each location pays its own price. Groups of five or more talk to us.
- No lock-in: month to month, cancel any time. A café can also pause the Service plan for up to 3 months a year, for a slow season or repairs; the free menu keeps working and switching back needs no new setup. Owners in the research expect cafés to close or change hands often (`docs/00-research/video-notes.md`, A4), so a contract would scare them more than it protects us.

## Billing

Stripe doesn't accept businesses from Armenia ([stripe.com/global](https://stripe.com/global) lists 51 countries, Armenia isn't one), so Stage 1 bills by monthly invoice in AMD, paid by bank transfer or at the bank. Card auto-billing comes with the Stage 3 Armenian payment provider. Which bank account receives the money is the owner's decision, needed before the first invoice.

Whether prices include VAT depends on our company's tax regime; an accountant confirms it before the first invoice. Prices shown to cafés are final, whatever the regime.

## Later

- Stage 2: the POS (bills, split bills, discounts, shifts, receipt printing) as a higher plan.
- Stage 3: a small fee per online payment, on top of the provider's fee, as the brief says. It can't be set until we know the provider's rates.
- Prices for existing cafés don't go up for 12 months after they start paying.

## How it maps to the schema

- `subscriptions.plan`: `menu` or `service` (the seed function currently writes `standard`; rename in the first Phase 6 migration).
- `subscriptions.price_amd` stores the price each café actually pays, so founding prices and annual prepayments need no special case.
- Entitlements live in Postgres: when a location is on `menu`, or `past_due` for more than 7 days, the guest ordering functions refuse, staff screens show a "plan ended" notice, and the public menu keeps working.

## Decisions

Taken on 9 Nov 2026 under the owner's delegation:

1. Plan structure: B, a free Menu plan and a paid Service plan.
2. Service price: 15,000 ֏ a month per location, or 150,000 ֏ a year paid upfront.
3. Founding cafés: free during the pilot, then 10,000 ֏ a month locked for 12 months.

Still open, and still the owner's: starting to charge also starts paid hosting, about 16,800 ֏ a month. That's a money decision under the free-only rule, and it comes when the first café agrees to pay, not now.
