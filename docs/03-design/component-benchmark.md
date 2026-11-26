# Component benchmark: Pativ against the best of its kind

Date: 26 Nov 2026. Merges the guest-side study (QR menu, order at table) and the staff-side study (waiter, kitchen, admin, auth, landing). Measured with Playwright at 390x844 and 1440x900 (`getComputedStyle`), from App Store screenshot sets and from help-centre pages where the product sits behind a login. Numbers marked "≈" were read off video frames. Decision record: ADR-093 in `docs/01-architecture/decisions.md`.

## 1. Platforms studied

| Platform | Area | Best at |
|---|---|---|
| Wolt (web, live venue) | Guest | Menu-to-cart loop: 16 px base, "+" that morphs into a stepper, 56 px stepper and CTA, "1 · View order · total" bar |
| Toast Order & Pay; Toast Go, KDS | Guest, waiter, kitchen | Table context on every screen, CTA that reads "Continue" until required choices are made, "Order more" / "Review check" fork; handheld with fixed Send bar; KDS age colours |
| me&u (ex Mr Yum) | Guest | Photo-led dine-in menu, "order more" through the meal |
| sunday, Qlub | Guest | Bill on the phone, split by item, people or amount |
| Uber Eats | Guest | 4-segment status bar, arrival window, 24 px state headline |
| Yandex Eats, Glovo, Menu.am | Guest (Yerevan) | Yandex: big type, square stepper. Glovo: calm closed-state sheet. Menu.am: the local anti-reference (10–11 px text, boxes) |
| Square (KDS, Dashboard) | Kitchen, admin, pairing | Column-count and text-size settings, All Day panel, device codes |
| Fresh KDS | Kitchen | Most legible ticket: qty badges, indented modifiers, strike-through items, All Day bar |
| iikoWaiter, Poster | Waiter | Table cards with time, guests and total; modifier tiles; state by fill colour |
| Linear, Stripe, Owner.com, Lightspeed, Tablein | Admin, auth, landing | Linear: one surface, "structure felt not seen". Stripe: type restraint, card-less sign-in. Owner.com: restaurant landing, tabbed showcase, real proof |

Sources by name/URL: wolt.com, toasttab.com (doc.toasttab.com platform guide, support.toasttab.com), meandu.com, sunday.app, qlub.io, ubereats.com, eats.yandex.com, glovoapp.com, menu.am, squareup.com/help (KDS, device codes), fresh.technology, App Store pages of iikoWaiter and Poster, linear.app/now/behind-the-latest-design-refresh, stripe.com, owner.com, lightspeedhq.com, tablein.com.

## 2. Component analysis

"Now" is Pativ before ADR-093. "Target" is what beats the best competitor. "F" marks what the shared foundation (tokens, shared primitives) already delivers; the rest belongs to the area passes.

### 2.1 Guest: finding things

| Component | Factors that matter | Best in class | Pativ now | Pativ target |
|---|---|---|---|---|
| Header / venue identity | Where am I, which table, one meta line, one surface | Wolt (40 px name, 16 px meta), Toast ("Dining at table 15") | 18 px name on a white strip over a grey band; no table, no open/closed | Name 20–24 px; one 15 px meta line «Սեղան 5 · Բաց է մինչև 23:00»; header on the page colour (F), hairline only once scrolled |
| Language switch | Visible, 44 px, current marked | Pativ (others hide it in the footer) | 12 px tabs, 40x44 | 15 px, 44x44 (F) |
| Search | Filled pill, ≥16 px text (no iOS zoom), filter inside | Wolt (no border, 16 px placeholder) | Bordered field + separate bordered filter box | 48 px filled pill, filter as an icon inside; ≥16 px on every field (F) |
| Category navigation | One sticky row, every category, scroll-spy, sticky chrome ≤ 14 % of the screen | Wolt, Toast (16 px tabs, 48 px, gliding underline) | 3 group chips with photos, third cut off; sticky chrome 166 px (20 %) | 15–16 px text tabs, 48 px, 200 ms underline glide; sticky chrome ≤ 104 px |

### 2.2 Guest: menu and dish

| Component | Factors | Best in class | Pativ now | Pativ target |
|---|---|---|---|---|
| Dish row | Text first, one row shape, rows on one surface, hairlines | Toast (0 borders, 1 px dividers), Wolt (16/600 names) | 22 bordered cards, 3 shapes, name 14 px, description 12 px | No card: rows on the page, 1 px hairline, 16 px edge (F on phone); name 17/600, description 16/24 (F) |
| Dish photo | One crop, one radius, nothing reserved without a photo | Wolt 16:9, Toast square 72 px | Photo stretched to card height (115–190 px), square right edge | 104x104 right, 12 px radius (radius F; size and side: area pass) |
| Add control | One tap for simple dishes, morphs into − n + | Wolt (46x44 notched "+") | "+" only with a table token; nothing on the public demo | 44 px "+", 180 ms morph into a 44 px pill; disabled "+" plus a scan-the-QR line without a table |
| Dish sheet | Title, required groups, CTA with total that reads "Choose n" | Wolt (24/700 title, 56 px CTA), Toast (required logic) | 22 px title, 44 px options at 14 px, 48 px CTA at 14 px | Title 24 px, description 16/24, 52 px options with 22 px controls at 16 px (sizes F), 56 px CTA with the total |
| Diet and badges | One quiet line, one badge | Toast | 1–3 grey 12 px pills per dish | One 13 px muted line (13 px F); one badge on the photo |

### 2.3 Guest: cart, order, after the order

| Component | Factors | Best in class | Pativ now | Pativ target |
|---|---|---|---|---|
| Cart bar | Total visible from the menu, the only strong block | Wolt (56 px, radius 20, "1 · View order · total") | Dock only, 12 px labels, no total | 56 px bar above the dock, one container with it; dock labels 13 px (F) |
| Cart / review | Table in the title, inline steppers, one CTA with total | Toast, Yandex Eats | 20 px title, 14 px lines | 28 px title + «Սեղան 5», lines 16 px (F), total 24/700, CTA «Ուղարկել խոհանոց · total» |
| Sending | No confirm modal, progress in the button, clear next step | Toast ("Order more" / "Review check & pay") | Strong error states (offline queue, sold out, menu changed) | Keep them; check-draw, order number 40 px, «Պատվիրել ևս» / «Հետևել պատվերին» |
| Order status | 4 segments, plain headline, time window | Uber Eats | 6 steps at 13 px | 4 segments, 24 px headline, «Մոտ N րոպե»; text ≥ 13 px (F) |
| Call waiter / bill | One tap with undo; bill total first | sunday, Qlub (bill); Pativ (call) | Confirm dialog | One tap + 5 s undo; bill sheet with 32 px total, split by people, cash or card (no online payment: free) |
| Empty / closed states | Skeleton in the real layout; one sentence, one action | Glovo, Wolt | Good copy, spinners avoided | 20 px headline, 16 px sentence, one 48 px button |

### 2.4 Staff, owner, marketing

| Component | Factors | Best in class | Pativ now | Pativ target |
|---|---|---|---|---|
| Waiter floor | One tile shape, state by fill, first row visible | Toast, Poster, iiko | 4 tile shapes, 5 strips above the grid, first tile at y≈320 | 112 px tiles, radius 16, 3 columns; 56 px header + one alert bar; first row at y ≤ 200 |
| Waiter table detail | Rows, not cards; fixed bar with total and one action | Toast Go, iikoWaiter | Card with rows; two pills at the bottom | 56 px hairline rows, 24 px total, one primary (cards flattened F) |
| Kitchen board | One board, lanes by dividers, column and text-size settings | Square, Fresh | 3 grey lane panels | One background (F: header and lanes take the board colour), 17 px lane labels, S/M/L text |
| Kitchen ticket | Number at distance, age colour, qty badge, strike-through | Fresh KDS | 64 px number (better than Fresh), outlined qty, ⊘ on every row | One header row, solid 32 px qty badge, tap to strike, ⊘ on long-press |
| Bump | One button, undo, recall, keys | Toast, Square | One 56 px button, no undo | 5 s undo toast, Recall of the last 10, 1–9 keys |
| Admin navigation | Sidebar on the page plane, ≤ 7 items, phone menu | Linear | Floating white sidebar card, 9 items, cut-off chip row on phone | Flush 240 px sidebar on the grey, white content (F); ≤ 7 items and a phone menu sheet (area pass) |
| Admin dashboard, forms | Group by space, max one card per view | Square, Stripe, Linear | 5 shadowed cards per screen | Sections: 20 px heading, hairline, content on the page, 40–48 px between groups (F) |
| Auth and pairing | One 400 px column, no card, 16 px input text | Stripe, Square (device codes) | White card with shadow; pairing page in its own style | No card, 400 px column, 40 px title (F); pairing code 28 px mono with one-time-code (area pass) |
| Landing | Big tight headline, real product, tabbed showcase, real proof | Owner.com, Linear | h1 32/44 px, 3 bordered cards + 1 wide card | h1 40 phone / 64 desktop at -0.02 em, 18–20 px lede, 56 px CTA (F); tabbed showcase and real Blanca proof (area pass) |

## 3. One whole platform, not a stack of blocks

| Factor | Rule for Pativ | Foundation token or primitive |
|---|---|---|
| One page colour | Header, sticky band, list and sheets share the page colour; only floating things lift | `--guest-surface` = `--guest-page`, `--guest-band` = page; admin content one white column |
| Hairlines, not boxes | No borders around content; 1 px line between rows, inset to the 16 px edge | `--guest-card-border: transparent`; phone dish rows split by `--guest-line`; `--color-hairline` #DDE0E6 for staff |
| One alignment edge | Every text start on the same 16 px edge | Phone dish rows drop inner side padding; admin Section has no inner padding |
| One radius family | 12 px controls, fields, photos; 20 px sheets and the one raised surface; full round for buttons and chips; 0 for page areas | `--radius-chip/input` 12, `--radius-soft` 20, `--guest-r-card` 12, `--guest-r-feature` 20, `--guest-r-pill` full |
| Flat grouping | Shadows only on what floats (sheets, toasts, tickets, round tool buttons) | Admin/staff white groups lose `--shadow-soft`; `soft-card` has no shadow |
| One type scale | 13/15/16/17/20/22/24/28/40 everywhere; staff extras KDS 26 and 64, landing hero 64 | `text-meta … text-figure` utilities in `globals.css` |
| One vocabulary | Same button heights (48, 56 primary), same field, same header pattern in every app | `admin-ui/styles.ts` (secondary is an inside outline, not a floating pill) |
| Fewer competing signals | One alert channel; red, amber, green for state only | Kept from ADR-054/056; area passes remove duplicate strips |

## 4. 2026, not 2008

| Reads as 2026 | Reads as 2008 |
|---|---|
| 16 px guest base, 17 px names, 1.45–1.5 line height for Armenian | 11–13 px text, ALL CAPS labels |
| One continuous surface; space and hairlines structure the page | Boxes inside boxes, a border on everything, heavy shadows |
| Photography carries the colour; UI is ink plus one accent | Coloured panels, gradients, glow, glass, decorative icons, emoji |
| Controls that morph in place, sheets that slide, 150–250 ms motion, off under reduced motion | Page reloads, "Are you sure?" modals, looping decoration |
| Sticky tab row with a scroll-spy underline | Dropdown "choose a menu", accordions hiding the menu |
| 44–56 px targets, full-width primary with the total inside | 30 px buttons, a cart icon on every card |
| Real states: offline queue, sold out, kitchen busy in minutes | "Error" toasts, spinners on blank pages |
| Tabular figures, `2 900 ֏` | Mixed number formats |
| Real product and a named café as proof | Feature-card grids, invented stats |

## 5. Measured effect of the foundation (ADR-093)

Pativ Demo menu at 390x844, first load, visible elements:

| Measure | Before | After |
|---|---|---|
| Font sizes in use | 12, 14, 16, 18, 20 (12 px on 51 elements) | 13, 15, 16, 17, 20 (nothing under 13) |
| Guest base / dish name / description / price | 14 / 16 / 14 / 14 px | 16 / 17 / 16 / 16 px |
| Fully bordered boxes | 25 | 3 (search field, filter, a category chip) |
| Surface tones before the first dish | 4 (white header, grey band, off-white page, white cards) | 1 (page) |
| Search field text | 16 px | 16 px, now guaranteed for every field |
