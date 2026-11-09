# Project brief for Claude Code: "Restaurant OS" for Armenia

You are the lead engineer on a new product. Read this whole brief before doing anything. Work in phases, stop at each gate for my approval, and keep everything you produce inside this repository.

---

## 0. First task: absorb the research

I am attaching (or pasting below) a document called **"Restaurant OS for Armenia: GitHub repos, skills and resources"**. It lists open-source restaurant systems, QR-menu projects, kitchen-display and receipt-printing libraries, the core stack, Armenian payment integrations (Ameriabank vPOS, ArCa, IDBank, Idram, Telcell), AI and messaging libraries, and Claude skills.

Before Phase 1:

1. Save that document as `docs/00-research/resources.md`.
2. Clone or browse the reference repos it lists, at minimum: `Raktim94/nodedr-restaurant-pos`, `kaje94/menufic`, `charnowsky/FeastQR`, `thisishowen-spec/eatlah`, `ury-erp/ury`, `ury-erp/mosaic`, `tastyigniter/TastyIgniter`, `at-point-of-sale/ReceiptPrinterEncoder`, `callmedearjohn/ameria-bank-vpos-api-documentation`. Clone into `/tmp/refs/`, never into this repo.
3. Write `docs/00-research/reference-analysis.md`: for each repo, cover its data model (tables, menus, orders, statuses), what to copy as an idea, what to avoid, its license, and whether we may reuse code. **Do not copy code from GPL or AGPL repos into our codebase.** Learn from them only.
4. Write `docs/00-research/gaps.md` listing what none of the references does well and where we can win in Armenia: Armenian-first UI, local payments, Telegram, AI onboarding, price.

**Gate 0:** show me a one-screen summary and wait for "go".

---

## 1. The product

**What it is:** a cloud platform that runs a café or restaurant's daily operations, built Armenian-first, starting in Yerevan. It is modelled on Toast (US) but simpler, cheaper, and sold to small independent cafés.

**Users:**
- **Guest:** scans a table QR code, browses the menu in Armenian, Russian or English, orders, and later pays. Nothing to install.
- **Waiter:** a tablet or phone web app to take orders, see table status and close bills.
- **Kitchen:** a screen showing incoming orders by table and time, with a "ready" button.
- **Owner/manager:** an admin panel to edit the menu, see sales, top dishes, staff performance and food cost. Gets alerts in Telegram.
- **Platform admin (me):** manages restaurants, subscriptions and support.

**Roadmap (build only Stage 1 now, but design the architecture for all four):**
- **Stage 1 (MVP):** multi-restaurant QR menu (hy/ru/en), table ordering, order status, waiter app, kitchen display, owner admin with a basic sales dashboard, Telegram alerts for new orders, and AI onboarding where the owner uploads a photo of a paper menu and Claude turns it into a structured, translated digital menu.
- **Stage 2:** full POS (bills, split bill, discounts, shifts), receipt printing over ESC/POS, staff accounts and roles.
- **Stage 3:** online payments through Armenian providers (start with Ameriabank vPOS or ArCa EPG), delivery and takeaway ordering from the restaurant's own page.
- **Stage 4:** inventory and recipes (food cost), loyalty, and an owner AI assistant that answers questions in Armenian about the business and can take actions.

**Business model:** a monthly subscription per location (Stage 1 target: 10,000–20,000 AMD/month), later plus a small fee per online payment. Each restaurant is a tenant.

---

## 2. Phases and deliverables

Each phase writes its documents to `docs/`. Stop at every gate and wait for my approval. Keep the documents short, concrete and decision-oriented: no filler.

### Phase 1: Architecture → `docs/01-architecture/`
- `overview.md`: a system diagram (Mermaid) of the guest app, waiter app, kitchen display, owner admin, platform admin, Supabase, the Claude API, the Telegram bot and future payment providers.
- `data-model.md`: the full Postgres schema for all four stages. Mark which tables Stage 1 builds. At minimum: restaurants (tenants), locations, members and roles, tables, menus, categories, items, item translations, modifiers, orders, order items, order status history, bills, payments (stub), audit log. Include an ERD in Mermaid.
- `multi-tenancy-and-security.md`: Supabase Row Level Security per restaurant, roles (owner, manager, waiter, kitchen), how guests order without accounts (signed table tokens), rate limiting, and abuse protection on public QR endpoints.
- `realtime.md`: how new orders reach the kitchen and waiters instantly (Supabase Realtime), and the offline behaviour on bad café Wi-Fi.
- `i18n.md`: Armenian (`lang="hy"`), Russian and English. Use reformed Armenian spelling, correct punctuation (։ ՝ ՞ « »), and fonts with full Armenian support. Menu items store per-language names and descriptions.
- `decisions.md`: ADR-style records of every important choice and the alternatives rejected.

**Gate 1.**

### Phase 2: Tools and stack → `docs/02-stack/`
- `stack.md`: the final list with versions and the reason for each. Default choice: Next.js (App Router) + TypeScript, Supabase (Postgres, Auth, Storage, Realtime), shadcn/ui + Tailwind, next-intl, TanStack Query or server actions, Zod, the Claude API through `@anthropic-ai/sdk` (or the Vercel AI SDK), grammY for Telegram, qr-code-styling for QR codes, Tremor or Recharts for dashboards, PostHog for analytics, Sentry for errors, Vercel for hosting. Challenge any of these if something is clearly better, and explain why.
- `repo-structure.md`: folders, naming, and where each app (guest, waiter, kitchen, admin) lives. One Next.js app with route groups is preferred unless you argue otherwise.
- `dev-workflow.md`: local Supabase, migrations, seed data with a realistic Yerevan café menu, env vars, test commands, CI on GitHub Actions, and preview deploys.
- Run a dependency and license check on every package you plan to add.

**Gate 2.**

### Phase 3: Design → `docs/03-design/`
- `design-direction.md`: the visual identity. It must look distinctive and premium, not like a generic AI template or default shadcn. Give 2–3 directions with a short rationale each, a palette, type pairing (with Armenian glyph support), and spacing and radius tokens.
- `screens.md`: every Stage 1 screen with its states (empty, loading, error, success): the guest menu, item detail, cart, order status, waiter table map, order taking, kitchen board, owner menu editor, the "photo to menu" onboarding, and the sales dashboard.
- `flows.md`: Mermaid flows for guest ordering, an order's life (new → accepted → cooking → ready → served → paid), owner onboarding, and the waiter's shift.
- Mobile-first for the guest app. Tablet layout for waiter and kitchen. Desktop and tablet for admin. Meet WCAG AA contrast, use large touch targets, and the kitchen screen must be readable from 2 metres away.
- Build clickable HTML/React mockups of the 4 key screens under `design/` before building the real app.

**Gate 3.**

### Phase 4: How it runs in real life → `docs/04-operations/`
- `day-in-the-life.md`: walk through a busy Friday evening at a 12-table café in Yerevan, minute by minute, and show where the system could fail: Wi-Fi drops, a tablet dies, the kitchen is overloaded, a guest orders twice, a waiter cancels an item.
- `reliability.md`: failure modes and the mitigation for each: retries, idempotent order submission, an offline queue, a manual fallback.
- `onboarding-a-cafe.md`: the exact steps to get a new café live in under 30 minutes, including printing the table QR codes.
- `support.md`: how owners report problems, the in-app help, and the Telegram support channel.
- `costs.md`: the monthly infrastructure and Claude API cost per café at 1, 10, 50 and 200 cafés.

**Gate 4.**

### Phase 5: How we succeed → `docs/05-business/`
- `positioning.md`: who we sell to first (independent cafés in central Yerevan), the one-sentence pitch, and why we beat paper menus, PDF menus on Instagram, and existing POS systems. Research which POS and QR-menu products are already used in Armenia, with sources.
- `pricing.md`: the plans, what's free, the trial, and the setup fee.
- `go-to-market.md`: the first 10 cafés plan (in-person visits, a free first month, a case study), then the next 50.
- `metrics.md`: what we track: orders per café per day, average bill, time from order to kitchen, churn, activation within the first week.
- `pitch-onepager.md`: a one-page pitch for café owners, in Armenian and Russian. Write it naturally, not as obvious AI text.

**Gate 5.**

### Phase 6: Build the product (Stage 1)
- First write `docs/06-build/plan.md`: milestones and tasks, each small enough to finish and verify in one sitting. Suggested order: project setup → auth and tenancy → menu model and admin editor → the guest QR menu (hy/ru/en) → table ordering → realtime kitchen board → waiter app → Telegram alerts → photo-to-menu AI onboarding → sales dashboard → polish.
- Build milestone by milestone. After each milestone:
  1. Run type checks, lint and tests.
  2. Test the real flows in a browser (Playwright): click through, check the console for errors, and check mobile and tablet sizes.
  3. Commit with a clear message.
  4. Give me a short status note: what works, what's next, any decision you need from me.
- Testing: unit tests for business logic (order totals, status transitions, permissions), integration tests for RLS policies (one restaurant must never see another's data), and end-to-end tests for guest order → kitchen → served.
- AI onboarding: use the Claude API with vision to read a menu photo into strict JSON (categories, items, prices in AMD, descriptions), validate it with Zod, translate it to hy/ru/en, and let the owner review everything before publishing. Never publish unreviewed AI output.

**Before any deploy:**
- Run a security review of the changes: auth, RLS, public endpoints, secrets, injection, rate limits.
- Run a dependency vulnerability and license check.
- Deploy to a **Vercel preview** only. Production only when I explicitly say so.

---

## 3. Rules for how you work

- **Plan before code.** For anything non-trivial, brainstorm options briefly, pick one with a reason, and write a short step-by-step plan.
- **Use skills.** Check the available skills and plugins at the start of each phase and use every one that fits. At minimum:
  - planning: `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:executing-plans`
  - design: `frontend-design`, `web-design-guidelines`, `design-inspiration-finder`, `det-ai` (remove the generic AI look)
  - code: `vercel-react-best-practices`, `vercel-composition-patterns`, `supabase`, `supabase-postgres-best-practices`
  - testing: `webapp-testing`, `playwright-cli`, `tdd`, `superpowers:verification-before-completion`
  - security: `semgrep`, `supply-chain-risk-auditor`, `differential-review`
  - deploy: `deploy-to-vercel`
  - Armenian text: `hy-writer`; all prose: `humanize`
  - At the end of each phase, list the skills you used.
- **Save tokens.** Use subagents with cheaper models (Sonnet or Haiku) for easy, mechanical steps: repo scanning, file searches, boilerplate, running tests. Use the strongest model only for architecture, design and complex logic.
- **Bugs:** reproduce first, find the root cause, then fix. Change only what's broken and keep the existing code style.
- **Verify, don't guess.** Never report something as done until you have run it and seen it work. If something is uncertain, test it.
- **Keep it simple.** Don't add libraries we don't need. Prefer boring, proven solutions. No premature microservices.
- **Secrets:** never commit keys. Use `.env.local` plus `.env.example`.
- **Language:** code, comments and docs in English. UI text in hy/ru/en through translation files, never hard-coded.
- **Ask me** only when a decision is genuinely mine (pricing, brand name, which bank, anything irreversible). Otherwise make the sensible call and note it in `decisions.md`.

---

## 4. Definition of done for Stage 1

A real café can do this:
1. The owner signs up, photographs the paper menu, reviews the AI-generated menu in three languages, and publishes it.
2. The owner prints branded QR codes for every table.
3. A guest scans one, orders in Armenian, and sees the order status live.
4. The kitchen sees the order within 2 seconds and marks it ready, and the waiter sees it and marks it served.
5. The owner gets a Telegram message for every new order and sees today's sales on the dashboard.
6. All of it works on a phone, a tablet and a laptop, passes the tests and the security review, and runs on a Vercel preview.

Start with section 0 now.
