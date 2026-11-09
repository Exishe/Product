# Stack

Every version below was the latest stable release on npm on 9 Nov 2026, unless the notes say why it's held back. The exact manifest is [`planned-package.json`](planned-package.json); Phase 6 starts the app from it. Dependency and license checks are in [`dependency-audit.md`](dependency-audit.md).

## The rule that shapes this phase: free until the owner says otherwise

Until the owner says otherwise, we use only free plans and free services. That changes three things in the brief:

| Brief says | While the free rule holds | Switch when paid is allowed |
|---|---|---|
| Claude API for menu import and translation | Same code path, Gemini free tier as the provider (`AI_PROVIDER=gemini`). Claude has no free tier. | Set `AI_PROVIDER=claude`; no code change |
| Vercel preview deploys | Vercel Hobby. Its terms allow "personal or non-commercial use" only, which covers building and a free pilot, not charging cafés. | Vercel Pro, or another host, before the first café pays (owner's decision) |
| Supabase | Free plan, in a new dedicated project. No backups on Free, so a nightly `pg_dump` runs in GitHub Actions. | Supabase Pro ($25/month) when the first café depends on it daily |

Other free-tier limits we design around are in the hosting table at the end.

## Application

| Package | Version | Why |
|---|---|---|
| Node.js | 24 LTS | Current LTS line on Vercel. Next.js 16 needs Node 20.9+. |
| `next` | 16.4.5 | App Router, Server Components, Server Actions, `after()`. One app with route groups (`repo-structure.md`). Note: in Next 16 `middleware.ts` became `proxy.ts` and runs on Node only. |
| `react`, `react-dom` | 19.3.1 | Required by Next 16. |
| `typescript` | 6.0.3 | Held back from 7.0.2 (released 9 Nov 2026): `typescript-eslint` 8.72.1 supports TypeScript `<6.1.0`. Move to 7 when the linter does. |
| `@supabase/supabase-js` | 2.119.0 | Database, Auth, Realtime and Storage client. |
| `@supabase/ssr` | 0.12.7 | Cookie-based sessions in Server Components, Server Actions and `proxy.ts`. |
| `next-intl` | 4.14.9 | hy/ru/en messages with ICU plurals; supports Next 16. Formatting of money and dates is our own module, because Chromium lacks Armenian locale data (`i18n.md`). |
| `zod` | 4.6.7 | One schema per input: forms, Server Actions, the AI menu output. |
| `@tanstack/react-query` | 5.107.1 | Client cache for live screens (kitchen, waiter, guest status). Realtime messages invalidate queries. Admin forms use Server Actions without it. |

## UI

| Package | Version | Why |
|---|---|---|
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.5 | Design tokens as CSS variables (Phase 3). |
| `shadcn` (CLI, run with `npx`, not installed) | 4.23.0 | Copies component source into our repo; we restyle it, so the app doesn't look like default shadcn. |
| `radix-ui` | 1.8.1 | Accessible primitives behind the shadcn components. |
| `class-variance-authority` | 0.7.1 | Component variants. |
| `clsx`, `tailwind-merge` | 2.1.1, 3.7.0 | Class composition (`cn()`). |
| `lucide-react` | 1.70.0 | Icons. |
| `tw-animate-css` | 1.4.0 | Animations used by shadcn components. |
| `recharts` | 3.10.1 | Sales dashboard, through shadcn's chart component. |

## Platform features

| Package | Version | Why |
|---|---|---|
| `@google/genai` | 3.0.0 | Gemini adapter for menu import and translation while the free rule holds. |
| `@anthropic-ai/sdk` | 1.6.0 | Claude adapter. Default model when enabled: `claude-opus-5-5`; a cheaper model is the owner's call. |
| `grammy` | 1.46.0 | Telegram bot in webhook mode inside a route handler. |
| `uqr` | 0.1.3 | QR matrix. We draw the branded SVG ourselves (café colours, logo in the middle) and print A4 sheets with print CSS. |
| `idb` | 8.0.4 | IndexedDB wrapper for the staff outbox. |
| `posthog-js` | 1.447.4 | Product analytics, loaded after hydration, EU host. |
| `@sentry/nextjs` | 11.11.0 | Error tracking for browser and server. |
| `server-only` | 0.0.1 | Build fails if a server module (the AI key, server-side Supabase client) is imported into client code. |
| Cloudflare Turnstile | — (script tag) | Invisible bot check before anonymous sign-in. Free. No npm package needed. |

## Development and tests

| Package | Version | Why |
|---|---|---|
| `supabase` (CLI) | 3.1.0 | Local stack, migrations, `db advisors`, `test db` (pgTAP), `gen types`. v3 targets the local stack by default and asks before changing a hosted project. |
| `vitest` | 5.1.0 | Unit tests: totals, formatters, transliteration, token signing, outbox logic. |
| `@playwright/test` | 1.65.0 | End-to-end: guest order → kitchen → served, at phone, tablet and desktop sizes, in hy/ru/en. |
| `eslint`, `eslint-config-next` | 9.39.5, 16.4.5 | Held back from ESLint 10: three plugins inside `eslint-config-next` (import, jsx-a11y, react) accept ESLint only up to 9. |
| `prettier`, `prettier-plugin-tailwindcss` | 3.9.10, 0.8.1 | Formatting. |
| `@types/node`, `@types/react`, `@types/react-dom` | 24.19.2, 19.3.0, 19.3.0 | Types matching Node 24 and React 19. |

Stage 2 adds `@point-of-sale/receipt-printer-encoder` 4.0.1 (MIT), audited when it's added.

## Where we changed the brief's defaults

| Default in the brief | Our choice | Reason |
|---|---|---|
| `qr-code-styling` | `uqr` + our own SVG | `qr-code-styling` 1.9.2 was last published in April 2025 and draws on a browser canvas. `uqr` (unjs) has no dependencies, was updated in April 2026 and returns a matrix we can render on the server for print sheets. |
| Tremor or Recharts | Recharts via shadcn charts | `@tremor/react` was last published in January 2025. Its newer copy-paste version is built on Recharts anyway. |
| Claude API through `@anthropic-ai/sdk` or the Vercel AI SDK | Our own `MenuReader` interface with two adapters, each on the provider's official SDK | The free rule needs Gemini now and Claude later. Two calls (read photo, translate) don't justify the `ai` package's abstraction, and each official SDK gives us that provider's structured-output features directly. |
| — (PWA not specified) | A hand-written service worker, no library | `@serwist/next` 9.5.13 needs `@serwist/cli` too. We need two caching rules (cache-first for hashed `/_next/static`, network-first for pages) and an offline page, about 60 lines. |
| TanStack Query or Server Actions | Both, each where it fits | Server Actions for admin forms; TanStack Query only on screens that update live. |
| — | npm, not pnpm | Boring and default. Its lockfile is the one our supply-chain audit can read. |

## AI provider plan

`MenuReader` has two methods, `readMenu(photos) → MenuDraft` and `translate(draft, targetLocales) → MenuDraft`. Both return data validated by the same Zod schema, so the review screen doesn't care which provider ran.

- **Gemini (now).** A Flash-class model available on the free tier, chosen in Phase 6 by running 15–20 real Yerevan menu photos through it and checking prices, names and Armenian spelling by hand. Free-tier prompts may be used by Google to improve its products. Menu photos are public information anyway, but owners should know, and the onboarding screen says so.
- **Claude (when paid is allowed).** `claude-opus-5-5` with structured output parsed by the SDK, as the brief asks. An import of about 4 photos and 80 dishes should cost well under one US dollar on Opus 5.5 ($4 / $20 per million input/output tokens). `costs.md` (Phase 4) measures it properly. Choosing a cheaper model (Sonnet 5.5, Haiku 5.5) is the owner's decision.
- Whatever the provider, nothing is published without the owner's review (ADR-014).

## Hosting and services: free limits we design around

Checked on 9 Nov 2026. Figures marked "vendor" come from the vendor's pricing page; figures marked "third-party" come from 2026 summaries and get rechecked before we rely on them.

| Service | Free plan limits that matter | Our response |
|---|---|---|
| Supabase Free (vendor) | 500 MB database, 1 GB storage, 5 GB egress, 50,000 monthly active users, 200 Realtime connections, 2 M Realtime messages, 2 active projects, paused after 1 week of inactivity, no backups, 1-day logs | Dedicated new project (the account's existing project belongs to another product and must not be touched). Nightly `pg_dump` to an encrypted GitHub Actions artifact. Anonymous guests count toward monthly active users, so the cleanup job matters. 200 connections ≈ 8 busy cafés, which is plenty for the pilot. |
| Vercel Hobby (vendor docs) | Non-commercial use only. Firewall: 3 custom rules, of which one can be a rate-limit rule | One rate-limit rule on `/t/*` (QR entry). Everything else relies on the Postgres limits. Paid hosting before the first paying café. |
| Gemini API free tier (vendor + third-party) | Rate limits per project, shown in AI Studio; prompts may be used to improve Google's products | Menu import is rare (a few per café, ever), so rate limits don't bite. Owners are told. |
| Cloudflare Turnstile | Free | — |
| Telegram Bot API | Free | Respect Telegram's per-chat send limits in the outbox worker. |
| Sentry Developer (third-party) | 5,000 errors per month, 1 user | Enough for a pilot; one shared login. |
| PostHog (third-party) | About 1 M events per month | Track a few key events, not every click. |
| Resend (third-party) | 3,000 emails per month, 100 per day, 1 domain | Custom SMTP for Supabase Auth emails (owner sign-up, magic links). Needs a domain; until then owners sign in with a password and the built-in mailer, which is fine for a handful of pilot owners. |
| GitHub Actions | Free minutes for private repos are limited (third-party: 2,000 per month) | Keep CI lean: unit and lint on every push, the full local-Supabase and Playwright job on pull requests only. |

When the owner lifts the free rule, the order of upgrades is: Supabase Pro (backups) → paid hosting (commercial use) → Claude → Resend with a domain. `costs.md` in Phase 4 prices it.
