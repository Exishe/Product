# Repository structure

One Next.js app (ADR-001). The four surfaces are route groups inside it, and feature code lives in feature folders that the routes import. The database lives in `supabase/`, and docs stay in `docs/`.

## Layout

```
.
├── CLAUDE.md                     working rules for AI sessions (free rule, gates, safety)
├── docs/                         phases 0–6
├── messages/                     UI strings: hy.json, ru.json, en.json
├── public/
│   ├── sw.js                     hand-written service worker (staff PWA)
│   └── icons/
├── supabase/
│   ├── config.toml
│   ├── migrations/               one file per change, created with `supabase migration new`
│   ├── seed.sql                  demo café «Դեմո սրճարան» / "Demo Café" (slug demo-cafe), Yerevan prices
│   └── tests/                    pgTAP: RLS per role per table, state machines
├── src/
│   ├── proxy.ts                  Next 16 proxy (was middleware): Supabase session refresh, guest locale routing
│   ├── app/
│   │   ├── [locale]/(guest)/m/[restaurant]/[location]/
│   │   │   ├── page.tsx                  menu (server-rendered from the published snapshot)
│   │   │   ├── cart/page.tsx
│   │   │   └── order/[orderId]/page.tsx  live status
│   │   ├── t/[token]/route.ts            QR entry: verify signature, set cookie, redirect
│   │   ├── (staff)/
│   │   │   ├── waiter/…                  floor map, take order, accept, serve, close table
│   │   │   └── kitchen/[stationId]/…     kitchen board
│   │   ├── (admin)/admin/…               menu, import, tables & QR, staff & devices, dashboard, settings
│   │   ├── (platform)/platform/…         restaurants, subscriptions, outbox dead letters
│   │   ├── (auth)/                       login, pair (device code), invite
│   │   ├── api/
│   │   │   ├── telegram/webhook/route.ts
│   │   │   └── jobs/[job]/route.ts       notify, overdue, daily-summary, cleanup (called by pg_cron)
│   │   ├── manifest.ts                   web app manifest (staff PWA)
│   │   └── layout.tsx, global-error.tsx
│   ├── features/
│   │   ├── menu/          editor, publish, snapshot types, stop list
│   │   ├── menu-import/   MenuReader interface, gemini.ts, claude.ts, Zod schema, review UI
│   │   ├── ordering/      cart, place-order action, guest status
│   │   ├── kitchen/       board, ticket card, sound, wake lock
│   │   ├── waiter/        floor map, order pad, settle
│   │   ├── tables-qr/     token signing, QR SVG, print sheet
│   │   ├── notifications/ Telegram bot, outbox worker, message templates per locale
│   │   ├── dashboard/     sales queries, charts
│   │   ├── staff/         invitations, device pairing
│   │   └── platform/      tenant admin
│   ├── components/
│   │   ├── ui/            shadcn source, restyled with our tokens
│   │   └── …              shared composites (LocaleSwitcher, Money, OfflineBanner)
│   └── lib/
│       ├── supabase/      server.ts, browser.ts, admin.server.ts (service role), types.ts (generated)
│       ├── realtime/      useLocationChannel, useGuestChannel (one hook hides the transport)
│       ├── offline/       outbox.ts (idb), replay.ts, sw-register.ts
│       ├── format/        money.ts, date.ts, translit.ts, plural helpers
│       ├── security/      table-token.server.ts, turnstile.server.ts, rate-limit helpers
│       └── env.ts         Zod-validated environment variables
└── tests/
    ├── e2e/               Playwright: guest → kitchen → served, offline replay, i18n overflow
    └── fixtures/          menu photos for import tests (public menus, no people in frame)
```

Unit tests sit next to the code they test (`money.test.ts` beside `money.ts`).

## Route groups and what they can import

| Group | URL | Who | Rendering | May import |
|---|---|---|---|---|
| `[locale]/(guest)` | `/hy/m/demo-cafe/main` | Guests | Server Components plus small client islands (cart, status) | `features/ordering`, `features/menu` (read types only), `lib/format`, `lib/realtime` |
| `(staff)` | `/waiter`, `/kitchen/<station>` | Paired devices, staff | Client-heavy, TanStack Query, offline outbox | `features/waiter`, `features/kitchen`, `lib/offline` |
| `(admin)` | `/admin/…` | Owners, managers | Server Components and Server Actions | Any `features/*` except `platform` |
| `(platform)` | `/platform/…` | Platform admins | Server Components | `features/platform` |

ESLint `no-restricted-imports` rules per folder enforce the "may import" column. The guest bundle must never pull in admin, staff or AI code. Phase 6 checks this with `next build` output sizes: the guest menu page targets under 100 KB of first-load JavaScript.

## Naming and conventions

- Files and folders: `kebab-case`. React components: `PascalCase` exports. Hooks: `useThing`.
- `*.server.ts` files start with `import 'server-only'`. Anything touching the service role key, QR signing keys, AI keys or the Telegram token lives in one.
- Server Actions live in `features/<feature>/actions.ts`. Each one validates its input with Zod, checks the caller's session, then calls one `api.*` database function or one Supabase query. No business rules in actions beyond that; the rules are in Postgres (ADR-004).
- Database names are `snake_case`; TypeScript is `camelCase`. Database types are generated (`supabase gen types`) into `src/lib/supabase/types.ts`, never hand-written.
- UI text only through `useTranslations` / `getTranslations` with namespaced keys (`kitchen.ticket.void`). No literals in JSX.
- Components follow the composition patterns we adopted:
  - compound components for complex widgets (`TicketCard.Root`, `TicketCard.Lines`, `TicketCard.Actions`);
  - explicit variants instead of boolean props (`VoidTicketCard` rather than `<TicketCard isVoid>`);
  - providers that hide how state works (`OutboxProvider` exposes `enqueue` and `pending`, not IndexedDB).
- No barrel `index.ts` files in `features/` or `lib/`: import from the file, so bundles stay small.

## Why one app

One deploy, one auth cookie domain, shared types and components. The cost is discipline at the boundaries, which the import rules and bundle-size check enforce. We'd split a surface into its own app only if its deploy cadence or runtime needs diverged, for example a native kitchen app or a local printer bridge in Stage 2. Nothing in Stage 1 needs that.
