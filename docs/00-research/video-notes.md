# Video + text research notes, 9 Nov 2026

Method: Gemini (free tier, URL-based video watching) after many 502/503/429 retries; some videos only succeeded on gemini-3.5-flash-lite, whose output is lower quality (marked LOW CONF). Text sources via WebSearch/WebFetch. Nothing here was verified against a transcript. Quotes are as Gemini rendered them.

## A. VIDEO SOURCES

### A1. iiko in Armenia, Ashot Barseghyan
URL: https://www.youtube.com/watch?v=U1l-QpXYwv8 (model gemini-3.6-flash, first 900s)
Speaker: Ashot Barseghyan, chairman of the Association of Restaurateurs of Armenia, says he co-owned 17 restaurants over 10-12 years. This is a promotional testimonial for iiko (vendor-friendly).
- 00:00: "Если у вас есть ресторан, заводите iiko, следите за своим бизнесом, управляйте им. Он еще и подскажет вовремя, что надо делать."
- 01:28: "Растут те сети, которые пользуются инструментами финансовыми и управленческими... Система управления и правильный учет — это основа."
- 02:54: P&L in iiko; previously large chains hired a separate financier, "сейчас это можно делать на уровне владельца бизнеса."
- 03:45: values 24/7 support: "в любом часу ночи... могу позвонить, и человек подключится, решит мою проблему."
- 05:28: investors must be trained to read the dashboard (which key numbers to watch remotely).
- 05:58: pure investors start interfering with operations within 2-6 months and the business fails.
- No prices stated. (Menu board on screen showed espresso 900 AMD, cappuccino/latte 1500 AMD; incidental.)
So what for us: iiko's pitch to owners is finance control, P&L and 24/7 human support, not ordering. Our owner dashboard should lead with "what did I earn, what is my food cost" and we need a reachable human (Telegram/phone) during service hours; an "investor/partner view" role is worth having.

### A2. iiko at Ktoor restaurant (Yerevan)
URL: https://www.youtube.com/watch?v=YCCgEOzLFz8 (gemini-3.5-flash-lite, LOW CONF)
Speaker: Armen Oganisyan, runs a company doing financial/management accounting for restaurants; says 7 years with iiko.
- 01:12: restaurant already HAD iiko but had not used it for real accounting until he came in.
- 02:30: looked at guests, orders, average check, concluded "raise prices by a few drams or cut cost by a few drams."
- 05:16: iiko can split cashless acquiring by bank (restaurant works with 4 banks).
- Claims profit grew "at least 25%" after optimization (unverified, lite model).
- Staff/waiters/QR: unclear.
So what for us: iiko is bought but under-used; the winning narrative is "average check and cost per dish" not features. Show average check and top/bottom dishes on day one. Multiple acquiring banks in Armenia: payment reports by method/bank would matter later.

### A3. Areg Gevorgyan on opening a restaurant in Armenia
URL: https://www.youtube.com/watch?v=mcxspzw6Dyo (gemini-3.5-flash-lite, LOW CONF; "1800 supermarkets" is almost certainly a mis-hearing of cafes/restaurants, ignore)
Speaker: Areg Gevorgyan, founder of Kamancha, Pideh, Toka Boka.
- 02:22: "a new restaurant or cafe opens in Yerevan every 2 days" (claim).
- 05:09: from second half 2021 "artificial" demand from Russian/Ukrainian arrivals; 08:31 "maybe we are back to the 2019 market"; 06:33 market +100% and prices +30% since 2021 (claims).
- 16:34: Pideh opening cost about $25,000.
- Software, staff, QR: unclear.
So what for us: market is churny and the post-2022 boom is fading; a 15,000 AMD/month tool must be justified against thin margins of a $25k-capex cafe. Sell to survivors and new openings with a "pays back in one month" calculation.

### A4. Restaurant sector, Mantashyants Business Club (Vahram Mirakyan hosts)
URL: https://www.youtube.com/watch?v=cruLVUkTedU (gemini-3.5-flash, 1200s, medium conf)
Speakers: Vahram Mirakyan (host); Bakur Melkonyan (Art Lunch, said >100 outlets, ~15bn AMD turnover); Armen Ghazaryan (Beer Academy, Etnograph, Epos).
- Host cites an average public-catering lifespan in Armenia of 13 months (sample of about 200 outlets). Unverified, but striking.
- 07:41 Ghazaryan: if a restaurant survives 3 years its chance of reaching 10-15 years triples. Failures between years 3-10 attributed to not moving from founder-run to systems.
- 16:13 owner absence: staff may contact him "only when the knife reaches the bone"; he came back to good metrics.
- Corporate canteen menu fatigue after 6-8 months.
So what for us: owners want to be away from the venue; Telegram alerts must be exception-based ("knife to the bone": stock-outs, voids, long tickets, cash discrepancies), not a firehose. Expect a high churn base: month-to-month, no lock-in, and an easy pause.

### A5. Saby Presto (Russian) restaurant automation 2026
URL: https://www.youtube.com/watch?v=QTAM4j4Mc2g (gemini-3.5-flash-lite, LOW CONF; vendor podcast)
Speakers: Irina Lisun (host), Nadezhda Kalinina (consultant), Nadezhda Belyaeva (Saby Presto, Tensor).
- 09:12 / 12:28: cafes juggle 3-5 separate tools (CRM, loyalty, booking, delivery, inventory); claimed 60-80k RUB/month combined vs ~11k RUB/month for the all-in-one (vendor claim).
- Switching systems is feared "like moving apartments": data loss, downtime, retraining staff.
- 17:06: free demo in an empty test environment, existing systems untouched.
- Built-in knowledge base to train and certify staff.
So what for us: bundle framing "one tool instead of five" and "try without touching your current setup" (a sandbox restaurant with sample menu and a test table) lowers switching fear.

### A6. QR code ordering vs table service, Dave Allred (Bar Patrol, USA)
URL: https://www.youtube.com/watch?v=ekg5IRRPELg (gemini-3.6-flash, second query; first answer truncated)
- 06:17: breweries where servers dropped off orders "without so much as a smirk" became "cold and boring and impersonal"; staff without training become "heartless robots" (05:51).
- Recommends a hybrid: guest chooses phone or server (06:41); not for fine dining (03:48).
- Claims up to 30% sales increase from visual menus/self-upsell (08:39; unsourced claim).
- 09:13: servers fear being replaced; later earn more tips by covering bigger sections (claim).
- 05:08: guests can message the server instead of craning to flag someone.
So what for us: pitch the waiter app as making waiters earn more, not replacing them; keep "call waiter" and waiter-takes-order as first-class; photos on menu items for self-upsell.

### A7. Weak or irrelevant (do not rely on)
- https://www.youtube.com/watch?v=OPN1R3RoNGY "Ненавижу меню по QR-кодам" (gemini-3.5-flash-lite): a New York vlogger hating QR menus and a Chipotle app-only order; summary partly implausible. Only takeaway: app-only/QR-only with no paper alternative annoys people; staff get blamed for policy. LOW CONF.
- https://www.youtube.com/watch?v=Nw76LOLSiJQ Alexander Orlov (Russian/Kazakh restaurateur, interviewer Armanzhan Baitasov; lite model): "do not start this business... low margin"; franchise ~$250k + 6-8% royalty; management takes 30-40% of profit. No software content. LOW relevance.
- https://www.youtube.com/watch?v=T2bjOhwB6yM PARA TV Business Inside #16 (Vahe Baloulian, Akomp; lite model): restaurants have short life cycles, staff sometimes resist new processes/menus, training needs patience and respect. Thin. LOW CONF.

## B. TEXT SOURCES

### B1. JAM-news, restaurant boom in Armenia (July 2025)
https://jam-news.net/restaurant-boom-in-armenia-business-responds-to-demand/
- Ashot Barseghyan (director, NGO Restaurant Association): meal for two ~20,000 AMD "has roughly doubled"; "Since January 2025, taxes have risen 2.5 times"; Europeans choose budget places, Russians spend on expensive places and drinks.
- Gohar Alumyan (restaurant marketing expert): mid/high-end guests are "tourists, embassy staff, or local residents with high incomes"; spend 40-50k AMD per head at top venues, ~3,000 at low end.
So what: tax pressure squeezes small cafes; 15,000 AMD must beat the cost of a lost table or a wasted hour. Tourists are a core guest segment, so RU/EN/HY menus are a real selling point, not a nicety.

### B2. EVN Report, Russian-speaking waitstaff
https://evnreport.com/lifestyle/russian-speaking-waitstaff-stir-debate/
- Shortage of Armenian waitstaff; Vachagan Tonoyan (former manager/trainer): Armenian waiters often dissatisfied with terms, Russian speakers easier to hire.
- Some waiters use only Russian with guests; a patron: "I expect Russian waiters to greet me in Armenian as a sign of respect." Some cafes print menus only in Russian, excluding Armenian speakers.
- Malocco Cafe manager: "If there's an issue, we just send over an Armenian-speaking waiter."
So what: the waiter app must work for staff who may not read Armenian (RU/EN UI per user, not per venue); guest-facing menu defaults to guest's language. A strong, concrete pain point: language mismatch between waiter and guest that QR menus solve.

### B3. PYMNTS, paper menus return (2024)
https://www.pymnts.com/restaurant-technology/2024/restaurants-reintroduce-paper-menus-amid-customer-complaints-about-qr-codes/
- Complaints: hard on small phone screens, privacy, ambiance, older guests; guests do not scroll the whole menu so check averages fall; one restaurant group saw a 10% drop in check average; only 31% of consumers positive about QR menus (PYMNTS Intelligence / Paytronix study). US data.
So what: keep a printed/fallback path and a waiter option; make menu fast, categorized with sticky nav; track check average before/after for the owner (proof or early warning).

### B4. SeenLabs, QR rebellion (vendor blog, no stats)
https://seenlabs.com/blog/the-qr-code-rebellion-why-customers-hate-digital-only-menus
- PDF menus slow and unreadable; dead battery/weak signal/no data; guests without phones; social disruption; feels out of place in fine dining.
So what: no PDFs, light pages, works on weak 3G, offline-tolerant table page.

### B5. HungryHungry, getting guests to use QR ordering
https://www.hungryhungry.com/en/blogs/get-customers-to-use-qr-code-ordering-at-table
- Staff default to taking orders verbally so guests keep old habit; codes must be in table centre, scannable in dim evening light, test seated; one consistent staff line; staff help stuck guests. No adoption stats.
So what: onboarding pack = table tents sized and tested under cafe lighting, a one-line staff script in hy/ru, a "first week" checklist.

### B6. Nory, restaurant tech implementation pitfalls (Daisy O'Malley, Feb 2025; vendor)
https://www.nory.ai/blog/avoid-restaurant-tech-implementation-pitfalls
- Failures: rollout not tested with kitchen screens (orders vanished on launch day); staff not told why; all docs dumped at once; no internal "champion"; no success metrics. Suggests role-specific training (front of house, kitchen, managers).
So what: onboarding should include a dry-run service with fake orders end to end before go-live, per-role 5-minute guides, name one champion per cafe, and track adoption KPIs (share of orders via QR, ticket times).

### B7. Russian trade press on QR/app ordering
https://www.dp.ru/a/2022/01/28/Nikakogo_obshhenija and https://www.dp.ru/a/2020/09/16/Oficiantov_pochti_otmenili
- Oleg Suzhaev (Restik, a SaaS vendor): apps must send orders to kitchen, show status in real time and handle stop-lists; "небольшие рестораны не способны самостоятельно реализовать такой проект" so use ready SaaS.
- Yandex.Eda press service: QR payment saves a waiter 5-7 min per table; 4 min per payment at counter venues.
- PITA'S chain (no direct quote): guests prefer ordering by phone with staff advice. Rexoft's Nikolai Potapov: "may pay extra for personal service" in future.
So what: stop-list (86) and real-time status are table stakes; QR bill payment is a lighter first step for skeptical cafes.

### B8. Armenian cash register (ՀԴՄ) context
Search results (armenian-lawyer.com, icarmenia.am, hartak.am): certified register connected to State Revenue Committee required where it applies; fines AMD 500,000 for operating without; a 2027 scope change was reported but unclear for cafes. UNVERIFIED for restaurants; check with SRC/accountant.
So what: we are not a ՀԴՄ; position as sitting beside the register (order and kitchen), and plan a fiscal-receipt integration question for the owner before promising payments.

### B9. Delivery and competitors in Armenia
Search found little 2025-26 commission data. Menu.am (2018 article) and Yandex Eats (regulator proceedings 2022) only. Local QR menu competitor found: Bonee System (Yerevan, gust.com listing, unverified). Reference price: ChoiceQR $13-25/month (Kyiv Post).
So what: do a manual price check of Bonee and other Yerevan QR menu vendors; free-menu-first plus 15k AMD tier is consistent with CIS benchmarks (~$13-25).

### B10. Staffing and pay context
EVN Report and job.am postings: café chain 250-300k AMD/month, hotel from 120k, restaurant day rate 15-25k AMD (employer asks, unverified).
So what: 15,000 AMD/month is about one waiter shift; frame ROI as "saves X waiter-hours or one lost table per day."

## C. FAILED / NOT DONE
- Gemini failures: heavy 502/503/429 on 3.8/3.7/3.6; most successes came from 3.6/3.5/3.5-lite after many retries.
- No video found of an Armenian owner talking specifically about QR ordering, KDS, waiters or ՀԴՄ; searched hy/ru/en. No Gastreet talk found. No video on KDS from a working chef found; KDS text results were vendor marketing only.
- nory.ai "what I've learned" returned 503; Ashot Barseghyan + iiko text search found nothing beyond B1.
- Unsearched/untested: iiko Armenia pricing confirmation (24,000 AMD/cash desk is from the brief, not verified here).
