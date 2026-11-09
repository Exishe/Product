# Design direction

## What the design has to do

Four surfaces, four jobs:

- Guest phone. Make a café's menu feel like that café's menu, readable in daylight on a terrace, in three languages, with ordering one thumb away.
- Waiter tablet. Show the whole room at a glance and make the next action obvious.
- Kitchen screen. Be readable from 2 metres with greasy hands and no time to look twice.
- Owner admin. Make editing the menu and reviewing AI output feel safe and quick.

Two constraints narrow the choices before taste comes in. First, only 8 Google Fonts families include Armenian at all (`docs/01-architecture/i18n.md`), and only Google Sans covers Armenian, Cyrillic and Latin in one family. Second, the most common "AI-generated" look today is a cream background with a serif headline and a terracotta accent. Yerevan's pink tuff stone pulls straight towards it, so we deliberately go elsewhere.

## Three directions

### A. Tarragon and apricot (recommended)

Colours from the table rather than the street: the deep green of tarragon (and the green «Թարխուն» lemonade everyone in Yerevan knows), apricot for anything you can tap, pomegranate for problems, on a cool, very slightly green white like matsoni. The menu reads like a printed café menu, not a delivery app: dish names in a condensed Armenian serif, prices aligned to the right edge with dotted leaders, portion weights in grams. The kitchen screen flips to a basalt-black board with tickets that look like paper slips.

Why it fits:
- Every colour comes from Armenian food, and none of them is a stock SaaS colour.
- High contrast in daylight.
- The "printed menu" pattern respects how cafés already present themselves.
- One palette stretches from the guest's phone to the dark kitchen board.

### B. Basalt and brass

Evening Yerevan: dark basalt surfaces, warm brass details, cafés on Saryan street after nine. Elegant on the owner's laptop and at night. Weak in daylight on a guest's phone, it reads as "upmarket bar" rather than "neighbourhood café", and a near-black interface with one warm accent is the second most common generated look. Kept as the source of the kitchen board's dark palette, not as the brand.

### C. Vernissage

Bold flat colour blocks and geometric motifs from Armenian rugs (eight-pointed stars, stepped medallions), like the stalls at the Vernissage market. Memorable on a poster and in the onboarding screens, but tiring at 20:30 on a Friday on a waiter tablet, and hard to keep accessible with many saturated colours next to text. Kept as a source for illustration and empty states, used sparingly.

**Recommendation: A**, with B's darkness for the kitchen and C's motifs only for empty states and onboarding illustrations. The mockups in `design/` use A.

## Tokens (direction A)

### Colour

| Token | Hex | Use | Checked contrast |
|---|---|---|---|
| `--matsoni` | `#FBFCF8` | Page background (guest, waiter, admin) | — |
| `--ink` | `#13241B` | Text | 15.7:1 on matsoni |
| `--muted` | `#4A5B51` | Secondary text | 7.0:1 on matsoni |
| `--tarragon` | `#1D6A43` | Brand, links, selected tab | 6.4:1 on matsoni; white on tarragon 6.6:1 |
| `--tarragon-tint` | `#E2EEE6` | Selected backgrounds | tarragon text on it 5.5:1 |
| `--apricot` | `#F2A23A` | Primary action background | ink on apricot 7.7:1 |
| `--apricot-deep` | `#C9780F` | Pressed state | ink on it 4.8:1 |
| `--pomegranate` | `#B0213A` | Errors, cancellations, sold out | 6.5:1 on matsoni; white on it 6.7:1 |
| `--pom-tint` | `#F8E3E6` | Error backgrounds | pomegranate text on it 5.5:1 |
| `--mist` | `#E8ECE6` | Secondary surfaces | muted text on it 6.1:1 |
| `--line` | `#C9D2C8` | Decorative dividers only | — |
| `--line-strong` | `#7C8B81` | Input and control borders | 3.5:1 (meets the 3:1 rule for UI boundaries) |
| `--basalt` | `#0E1612` | Kitchen board background | — |
| `--basalt-2` | `#18231D` | Kitchen columns | slip text 15.1:1 |
| `--slip` | `#F6F8F2` | Kitchen ticket paper | ink on slip 15.2:1 |
| `--apricot-on-dark` | `#F7B45A` | Kitchen "late" band | 9.0:1 on basalt-2 |
| `--pom-on-dark` | `#FF6B7E` | Kitchen "very late" and void | 5.9:1 on basalt-2 |
| `--tarragon-on-dark` | `#5CC48E` | Kitchen "ready" | 7.5:1 on basalt-2 |

Status is never colour alone: every coloured state also has a word, an icon or a shape (a struck-through line, a "late" label).

The guest app is light-only in Stage 1; it's used in lit cafés and daylight. The kitchen board is dark-only. The admin gets a dark theme in Stage 2 if owners ask for it.

### Type

| Role | Family | Settings | Why |
|---|---|---|---|
| Dish names, café name, big headings | Noto Serif Armenian, then Noto Serif for Cyrillic | Width 75 %, weight 600; menu names 22/26 px on phones | Condensed serif feels like a printed menu and fits long Armenian and Russian names on one line. Both are OFL and both have the width axis. |
| UI, body, numbers | Google Sans | 400 and 600; 16/24 px body on phones, tabular figures for prices | One family covering Armenian, Cyrillic and Latin, so UI text never mixes fallback fonts mid-word. OFL. |
| Kitchen board | Google Sans | 700 for table numbers (64 px), 600 for items (26 px), tabular timers | Plain, heavy, legible from 2 metres. No serif on the board. |

Type scale (px, 1.25 ratio, rounded): 12, 14, 16, 20, 24, 30, 38, 48, 64. Line length stays under about 65 characters. Headings use `text-wrap: balance`. No all-caps labels: Armenian capitals are hard to scan, and all-caps Russian shouts.

### Space, radius, touch

- Spacing: 4 px base. Steps 4, 8, 12, 16, 24, 32, 48, 64. Gaps between groups, not margins on items.
- Radius by role, not one value everywhere: 6 px for inputs and chips, 12 px for sheets and dialogs, 20 px for the top of the guest bottom sheet, 2 px for kitchen slips (paper has sharp corners), full pill only for status chips.
- Touch targets: 48 × 48 px minimum on guest screens, 56 px on the waiter tablet, 72 px tall buttons on the kitchen board.
- Elevation: one shadow, used only for things floating above content (the cart bar, sheets, dialogs). Cards on the page sit flat on a hairline.

### Motion

- One orchestrated moment per surface:
  - Guest: the order button turns into the status tracker.
  - Kitchen: a new ticket slides in from the left with a sound.
  - Waiter: a table that needs attention pulses once, then stays marked.
- Everything else is instant. `prefers-reduced-motion` turns the moments into simple fades.

### Imagery

Photos are optional, because most cafés don't have good ones. A menu without photos must look complete, which the printed-menu layout does on its own. When a dish has a photo, it shows as a small square beside the name, never as a full-width hero card. Empty states use simple line drawings derived from rug motifs (direction C) in tarragon on matsoni. No stock photos, no AI-generated food photos.

## Brand

The product's name is the owner's decision and isn't settled. Guests mostly see the café's own name and logo; our name appears in the admin, on the QR card's small print and in Telegram messages. The mockups use "Restaurant OS" as a placeholder.
