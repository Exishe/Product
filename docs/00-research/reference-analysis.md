# Reference analysis

Read on 9 Nov 2026 from shallow clones in `/tmp/refs/` (outside this repo). File paths below are relative to each repo's root. Four subagents read the code. I then checked the claims that drive decisions against the source myself: status enums, QR token handling, price column types, license files, the eatlah AI stub, and the printer codepages.

## Summary

| Repo | What it is | License | Code reuse | Main lesson for us |
|---|---|---|---|---|
| Raktim94/nodedr-restaurant-pos | Full POS: NestJS + Prisma + Next.js, ~100 models | AGPL-3.0 (+ paid commercial license) | No | Separate state machines for order, kitchen ticket and payment; idempotency keys; station fan-out |
| kaje94/menufic | View-only menu builder, Next 13 Pages Router | MIT | Legally yes, practically no | Publish flag + preview; shared Zod validators |
| charnowsky/FeastQR | Multi-menu SaaS, Next 14 + Supabase | None (all rights reserved) | No | Per-entity translation tables; integer prices |
| thisishowen-spec/eatlah | "Snap a menu → QR orders" for hawker stalls | None (all rights reserved) | No | Upload → recognise → review UX; the AI itself is not in the repo |
| ury-erp/ury | Restaurant app on Frappe/ERPNext | AGPL-3.0 (`hooks.py` says MIT; the LICENSE file wins) | No | HMAC-signed QR sessions; immutable kitchen tickets with cancel tickets |
| ury-erp/mosaic | Kitchen display for URY, Vue | AGPL-3.0 | No | What a KDS needs, mostly by counter-example |
| tastyigniter/TastyIgniter (+ `tastyigniter/core`) | Online ordering and reservations, Laravel | MIT | No (PHP) | Statuses as per-tenant data with history; location as a first-class entity |
| at-point-of-sale/ReceiptPrinterEncoder | ESC/POS / StarPRNT byte encoder, JS | MIT | Yes, as an npm dependency in Stage 2 | Armenian has no codepage, so it must print as a raster image |
| callmedearjohn/ameria-bank-vpos-api-documentation | Unofficial Ameriabank vPOS guide (.docx) | None | No (docs) | Hosted-page flow, no webhook, verify on the server |

License rule we follow: **no code from AGPL or unlicensed repos enters this codebase.** That covers nodedr, ury, mosaic, FeastQR, eatlah and the Ameria guide. For those repos we only read the code to learn from it, and we write our own implementation from our own specs. MIT code may be reused with its copyright notice. The only MIT code we plan to use is ReceiptPrinterEncoder, installed as a dependency, never vendored.

---

## Raktim94/nodedr-restaurant-pos

Last commit 9 Nov 2026 (v1.25.0), very active. Monorepo: `apps/backend` (NestJS, Prisma on Postgres, Socket.IO), `apps/web` (Next.js App Router, shadcn, TanStack Query, next-intl), `packages/types` (shared Zod). It is a self-hosted product: one restaurant per install, running on the café's LAN.

Data model (`apps/backend/prisma/schema.prisma`, 2,700 lines)
- Tenant: `Restaurant` (currency, timezone, loyalty config) → `Branch` (tax regime, printer config, `autoConfirmOrders`).
- Staff: `User` (PIN hash, TOTP), `Role`, `Permission`, `RolePermission`, `UserPermissionOverride`, `UserBranch`.
- Floor: `Floor` → `Table` (number, capacity, status, `statusSince`, x/y/w/h/rotation/shape, `assignedWaiterId`, unique `qrToken`), plus `TableRequest` (call waiter / ask for bill).
- Menu: `MenuCategory`, `MenuItem` (tax-inclusive price, `stationId`, allergens, availability window), `ModifierGroup` (min/max/required), `Modifier` (price adjustment), `ComboComponent`. Names are single strings: no translations, no variants.
- Orders: `Order` (type, status, channel, acceptance, `clientRequestId`, totals), `OrderItem` with name, price and tax rate snapshotted, `OrderItemModifier`.
- Kitchen: `KitchenStation`, `Kot` (one per station per round; `acceptedAt`, `readyAt`, `servedAt`, reject reason), `KotItem`.
- Money: `Payment` (unique `[orderId, clientRequestId]`), `Refund`, `CashClosing`, gateway models for Razorpay/Cashfree/Stripe.
- Also present: reservations, waitlist, loyalty ledger, coupons, ingredients and recipes, stock, procurement, `AuditLog` (no tenant column).

Statuses. Three separate machines, explained in `packages/types/src/order-lifecycle.ts`:
- `OrderStatus { OPEN BILLED PAID CANCELLED }`
- `KotStatus { NEW ACCEPTED PREPARING READY SERVED CANCELLED REJECTED }` with a coded transition table (`KOT_TRANSITIONS`). SERVED, CANCELLED and REJECTED are terminal. Every move is compare-and-set, so a double tap gets HTTP 409.
- `AcceptanceStatus { NOT_REQUIRED PENDING ACCEPTED REJECTED }` for orders that need staff approval.
- The order's kitchen progress is the slowest live ticket (`kitchenProgress()`).

Guest QR flow (`apps/backend/src/modules/public/`): the QR holds the table's opaque `qrToken`. No guest account, just a typed name. Rate limits of 10/min for the menu and 6/min for orders. A second scan appends to the table's open order instead of starting a new one. The kiosk path has an idempotency key; the QR path does not. The token is never rotated.

Realtime and offline. Socket.IO rooms per branch. Events only tell the client to refetch, and clients do a full refetch on reconnect. Offline: a 7-day read cache plus an outbox for KDS status taps. Money actions are never queued.

Copy as ideas
- Keep order lifecycle, kitchen ticket status and payment status as separate state machines, so "paid but still cooking" is a normal state, not a bug.
- One transition table that both the database and the UI use; compare-and-set updates.
- Snapshot item name, price and tax onto order lines.
- Realtime messages as "refetch" hints, plus a full resync on reconnect. This maps directly onto Supabase Realtime.
- Fan an order out into one kitchen ticket per station, using a per-item station.
- Idempotency key on every write a guest or flaky tablet can repeat.
- A single, unit-tested bill calculation used for both the screen and the printout.

Avoid
- Scope sprawl: payroll, procurement, Spanish e-invoicing and India GST before the core works.
- Tenancy enforced only in application code; audit log without a tenant column.
- A static QR token that works forever from a photo of the sticker.
- Guest orders attributed to a random staff member because `createdById` is required.
- Single-language menu fields.

License: AGPL-3.0. Using its code would oblige us to publish our whole SaaS source. Ideas only.

---

## kaje94/menufic

Last commit Oct 2024. Next 13 Pages Router, tRPC, Prisma 4, NextAuth, Mantine, ImageKit. View-only menus: no orders.

Data model (`prisma/schema.prisma`): `Restaurant` (isPublished, banners) → `Menu` (availableTime as free text) → `Category` → `MenuItem` (price is a `String`) + `Image` (blurHash, dominant colour). Every table carries `userId` with a composite `(id, userId)` key and no real foreign keys (`relationMode = "prisma"`). No tables, orders, statuses, roles or content translations. UI strings come from next-intl, English only.

Copy as ideas: `isPublished` plus a preview route before going live; Zod validators with max lengths shared by form and API (`src/utils/validators.ts`); blurHash and dominant colour stored per image for nicer loading; per-tenant limits enforced on the server; Playwright smoke tests and `/api/health`.

Avoid: prices as text; missing foreign keys; an outdated stack.

License: MIT, so reuse is allowed with the notice. Nothing is worth porting.

---

## charnowsky/FeastQR

Last commit Jan 2024. Next 14 App Router, tRPC, Prisma on Supabase Postgres, Supabase Auth and Storage, i18next, shadcn, LemonSqueezy billing. View-only menus.

Data model (`prisma/schema.prisma`, `supabase/migrations/`): `Menus` (unique slug, owner, isPublished, address, socials, logo) → `Categories` + `CategoriesTranslation(categoryId, languageId)` → `Dishes` (`price Int`, macros, picture) + `DishesTranslation(dishId, languageId, name, description)` → `DishVariants` + `VariantTranslations`. `Languages` and `MenuLanguages(menuId, languageId, isDefault)` choose which languages a menu offers. Tags are a fixed enum (vegan, keto, gluten-free and others).

RLS is enabled on every table, but policies exist only for `profiles` and the storage bucket (first folder segment must equal `auth.uid()`). All other access goes through Prisma with a privileged connection, so RLS does nothing there.

Copy as ideas: per-entity translation rows with a per-menu default language; integer prices; a print-ready QR card page (`src/app/generation/qr-menu-pdf`); storage paths namespaced by tenant and checked in a storage policy.

Avoid: RLS switched on with no policies (looks safe, isn't); a hard-coded currency and a `/100` divisor; `dishes_tag.tag_name` as the primary key, so a tag can belong to only one dish.

License: none, so all rights reserved, despite the README calling it open source. Ideas only.

---

## thisishowen-spec/eatlah

Last commit Jun 2026. TanStack Start + Vite, shadcn, Supabase, built on Lovable. Chinese and English.

The public repo is a demo shell. `.env.example` says production AI and backend are omitted, `supabase/` holds only `config.toml`, and `recognizeMenuFromImage` in `src/lib/menu-import.functions.ts` ignores the image and returns four fixed dishes (`warnings: ["Public demo: recognition uses fixed sample dishes."]`). The README names "Gemini VLM". There is no prompt, no model call and no real schema to learn from.

What is there (UX and payload shapes)
- Import flow in `src/features/merchant/MenuImportPage.tsx`: upload → recognising → review. Images up to 20 MB are resized in the browser to a 1600 px long edge, JPEG 0.85, before upload.
- Recognised item shape: category, name, price, description, each with an `_en` twin; options with `price_delta`; `confidence`; and bounding boxes for the text and the dish photo. In review, low-confidence items are flagged and each dish photo is cropped out of the menu photo using its box.
- Publishing creates a numbered menu version.
- Orders: `status` is `pending | preparing | completed | cancelled`, with a separate `payment_status`. Order items snapshot name and unit price. Guests see a short display code whose letter encodes dine-in/takeaway and payment type. Status is polled every 5 seconds. The merchant app speaks new and overdue orders aloud.

Copy as ideas: the three-step import with confidence flags; downscaling before upload; cropping dish photos from the menu photo; versioned menu publishing; short spoken-or-shown order codes; voice or sound alerts for new and overdue orders.

Avoid: `name`/`name_en` column pairs (does not scale to three languages); float prices; polling; a status set without accepted/ready/served. It teaches nothing about how the AI part works.

License: none. Ideas only.

---

## ury-erp/ury

Last commit 3 Nov 2026. A Frappe v15 app that requires ERPNext. ERPNext supplies items, price lists, customers, POS Invoice, POS Profile, shift opening and closing, payment modes, taxes, BOMs and stock. URY adds restaurant, room, table, menu, kitchen tickets (KOT), production units, self-ordering and reservations. Single company per install; branches are a link field checked in code.

Data model (`ury/ury/doctype/*/*.json`)
- `URY Restaurant` (active menu, menus per room or order type) → `URY Room` → `URY Table` (seats, occupied, `merged_with`, layout x/y/w/h, shape).
- `URY Menu` (price list, branch) → `URY Menu Item` (item, rate, course, special dish).
- `URY Production Unit` = kitchen station: the item groups it cooks, its printers, the order types it shows.
- The order is an ERPNext POS Invoice in draft, extended with `custom_*` fields.
- `URY KOT`: `type` is `New Order | Order Modified | Cancelled | Partially cancelled | Duplicate`; `original_kot` links a change to the ticket it changes; `production_time` records cooking time. `order_status` is a free-text field with two observed values, "Ready For Prepare" and "Served".
- `URY KOT Items`: quantity, `cancelled_qty`, course, serve priority.
- Self-ordering: `URY Self Ordering Profile` (feature switches, `qr_signing_secret`, idle timeout), `URY Ordering Session` (source `QR Table | QR Pickup | Kiosk | Table Tablet`, status `Active | Expired | Closed`, hashed token, expiry), `URY Service Request` (`Bill | Assistance`, status `Open | Acknowledged | Resolved`).
- Roles: Captain (waiter), Cashier, Manager, Admin (`ury/role_permissions.py`).

Kitchen ticket logic (`ury/ury/api/ury_kot_generate.py`): on every save the server compares old and new item lists. Additions become a new ticket; removals become a cancel ticket that shows old and new quantities and needs a manager to confirm. Routing is by item group → production unit. Unmapped items only produce a warning.

QR security (`ury/ury/api/self_ordering.py`): the QR is `base64url(profile|table|HMAC-SHA256)` signed with a per-profile secret and compared in constant time. Scanning opens a server-side session with a hashed token and an idle timeout. The server re-prices everything from the price list and never trusts client prices. Tests exist (`api/test_self_ordering.py`).

Copy as ideas
- Signed table QR → short-lived ordering session → server-side pricing. This is the best guest-security model of all the references.
- Kitchen tickets are immutable: a change is a new ticket linked to the original; a cancellation is visible and must be acknowledged on the KDS.
- Station routing by category, with an order-type filter per station.
- A service-request entity (bill, assistance) with its own small status set.
- `source` on the session, so QR, kiosk and table tablet share one flow.
- Cooking time stored per ticket for kitchen-speed reports.
- Opening and closing checklists for shifts (Stage 2).

Avoid: free-text status fields; no per-item kitchen status; deriving cancellations by diffing arrays sent by the client (record item events on the server instead); hard ERPNext coupling; single-tenant installs.

License: AGPL-3.0. Ideas only.

---

## ury-erp/mosaic

Last commit Oct 2025 (a newer copy lives in `ury/mosaic/`). Vue 3 + Tailwind, one 560-line component (`URYMosaic/src/components/kot.vue`). It loads open tickets once, then listens on a socket.io channel named `kot_update_<branch>_<unit>`. A masonry grid holds one card per ticket. Colour means type: white for a table order, blue for takeaway, orange for modified, red for cancelled. Elapsed time turns red after a configured limit and only updates once a minute. A sound plays per new ticket after the user clicks to unlock audio. Actions sit behind a tap-to-reveal overlay: "Serve" for normal tickets, "Confirm" for cancellations. There is no per-item bump and no recall.

Copy as ideas: one URL per station; colour by ticket type; cancelled lines with old and new quantity; an "unlock audio" banner; a configurable lateness threshold; a connection indicator.

Do better (requirements for our KDS, readable from 2 m)
- Columns by state (New → Cooking → Ready), oldest first.
- Table number and quantity as the largest text on the card.
- Elapsed time ticking every second, with the card colour changing at thresholds.
- Text badges ("+ADD", "CANCEL") next to colour, so the screen does not rely on colour alone.
- Big, always-visible bump buttons and a recall for the last few bumped tickets.
- Tenant-scoped, authenticated channels, plus a full resync on reconnect.

License: AGPL-3.0. Ideas only.

---

## tastyigniter/TastyIgniter and tastyigniter/core

`TastyIgniter` is a Laravel 13 app shell. Its only domain dependency is `tastyigniter/core ^4.4`, which I cloned separately (last commit 8 Nov 2026, MIT). Columns come from `core/database/migrations/system/2015_03_25_000001_create_tables.php` and later migrations.

Data model
- `locations`: address, lat/lng, `offer_delivery`, `offer_collection`, delivery and collection times, reservation interval and stay time. `location_areas` define delivery zones per location, and `locationables` attach menus, staff and tables to locations.
- `menus` (name, description, decimal price, category, stock quantity, mealtime) → global `options` (`display_type`) and `option_values` (price) → `menu_options` (per-menu link, `required`) → `menu_option_values` (per-menu price override).
- `orders`: customer details, location, `order_type`, `cart`, `order_total`, `status_id`, invoice number and prefix. `order_menus` snapshot name, price and options per line. `order_options` holds the chosen options, and `order_totals` holds subtotal, delivery, tax and discount as separate rows (`code`, `title`, `value`).
- `statuses` are data, not an enum: `status_name`, `status_for` (order or reservation), `status_color`, `notify_customer`. The seeded order statuses are Received, Pending, Preparation, Delivery, Completed and Canceled (`database/records/statuses.json`). `status_history` records every change with the staff member, the assignee, the notify flag and a comment.
- `tables` (min/max capacity) and `reservations`; `staff_groups` and `staff_roles`.

Copy as ideas: a status-history table recording who changed what and whether the guest was notified; reusable option groups with per-item price overrides; order totals as separate rows (useful for Stage 2 discounts and service charge); location-level settings for delivery and reservations (Stage 3).

Avoid: fully configurable statuses. They make the KDS and analytics guesswork; a fixed state machine with translated labels is safer. Also avoid dropping foreign keys (`2022_06_30_..._drop_foreign_key_constraints_on_all_tables.php`) and storing a serialised cart on the order.

License: MIT. The code is PHP, so nothing is reusable in practice.

---

## at-point-of-sale/ReceiptPrinterEncoder

`@point-of-sale/receipt-printer-encoder` 4.0.1, last commit Sep 2026, TypeScript types included, about 29 KB gzipped (UMD). It builds byte commands for ESC/POS, StarPRNT and StarLine: text styles, tables, boxes, QR codes, barcodes, images, cut. It ships profiles for about 40 printers, including the cheap Xprinter and POS-58/80 models common in small cafés (`data/printers/*.json`).

Armenian: none of its codepages covers Armenian; a search for Armenian, ArmSCII and cp1132 finds nothing. The documented workaround (`documentation/text.md`) is to render text to a canvas and print it as an image with `.image()`. Cyrillic works natively through cp866 and windows-1251.

Transport: it only produces bytes. Sibling libraries send them over WebUSB, WebSerial or WebBluetooth (Chrome and Edge only), or over TCP 9100 from Node. A Vercel-hosted app cannot reach a printer on the café's network, so network printers need a browser-side path or a small local bridge.

Verdict: use it as a dependency in Stage 2, rendering Armenian lines as images. Prototype with a real 58 mm printer early, since bitmap text on cheap printers can look rough.

---

## callmedearjohn/ameria-bank-vpos-api-documentation

An unofficial guide by a third party (June 2026), not bank documentation. It points to the official reference at `servicestest.ameriabank.am/VPOS/help`.

- Environments: test `https://servicestest.ameriabank.am/VPOS/api/VPOS/{Endpoint}` and production `https://services.ameriabank.am/VPOS/api/VPOS/{Endpoint}`. JSON POST with `ClientID`, `Username` and `Password` in the request body.
- Flow: our server calls `InitPayment` (Amount, integer `OrderID`, `Currency: "AMD"`, `BackURL`) → redirect the guest to the bank's hosted page → the bank redirects back → the server calls `GetPaymentDetails` → `ConfirmPayment` for two-step payments → `RefundPayment` or `CancelPayment` when needed. Saved-card "binding" endpoints exist too.
- `PaymentState`: 0 created, 1 authorised, 2 deposited, 3 cancelled, 4 refunded, 6 declined. Success is the response code `"00"` (sometimes integer `0`).
- Gotchas: no webhook and no signature, so never trust the redirect; always confirm with `GetPaymentDetails`. `OrderID` must be unique per attempt, so a retry needs a new one. Amounts are decimals in AMD. The guide also contradicts itself in places (OrderID suffixes vs integer type; currency "AMD" vs the numeric 051).
- Multi-tenant impact: each café probably needs its own merchant contract and credentials, stored encrypted per tenant. A marketplace or sub-merchant arrangement would change that; ask the bank.

License: none, and it is documentation. We write our own client against the bank's official reference.

---

## What we carry into Phase 1

These are proposals for `docs/01-architecture/`, with the reference each one comes from. Final choices go into `decisions.md`.

1. Three state machines. The guest-facing order (`new → accepted → cooking → ready → served → paid`) is derived from the kitchen ticket status and a separate payment status (nodedr). Transitions are enforced in Postgres and mirrored in a shared TypeScript table.
2. Kitchen tickets per station, immutable. Additions and cancellations create new linked tickets; cancellations need a tap to acknowledge on the KDS (URY). Routing goes by category, with a per-item override (URY, nodedr).
3. Snapshots on order lines. Name in all three languages, price and modifiers are copied at order time (nodedr, eatlah, TastyIgniter).
4. Prices as integer AMD. Converted to a decimal only at the payment-provider boundary (FeastQR's integers; Ameria's decimals).
5. Menu translations in rows or a JSONB locale map, never `name_en` columns. We will pick one in `data-model.md` (FeastQR vs eatlah).
6. Draft and published menu versions. Guests always see the last published version (eatlah, menufic).
7. Signed table QR → short-lived session → server-side pricing → rate limits → idempotency key per submission → append to the open table tab (URY, nodedr).
8. Service requests ("call waiter", "bring the bill") as their own small entity (URY, nodedr).
9. Status history and audit log with a tenant column (TastyIgniter, nodedr's missing column).
10. Realtime as a refetch hint plus a full resync on reconnect (nodedr), on Supabase Realtime with RLS-scoped channels (fixing mosaic's open channels).
11. Photo-to-menu: eatlah's UX (resize, progress, review with confidence flags, dish-photo crops). The pipeline itself is ours: Claude vision → strict JSON → Zod → translation → owner review.
12. Stage 2 printing with ReceiptPrinterEncoder, Armenian rendered as images.
13. Stage 3 Ameria vPOS: hosted page, server-side verification, per-tenant encrypted credentials.

## Not read in this pass

These were listed in `resources.md` but not cloned. Next to read: FloCafe (offline-first; read it before writing `realtime.md`), OrderWorder (AI dish recommendations, relevant to Stage 4), odoo's POS restaurant module (the most mature split-bill and course logic; read it before Stage 2), pizzaql, opensourcepos, pronto, OpenKDS, the other payment drivers.
