# Development workflow

## Two ways to run the database

| Where you work | Database | Why |
|---|---|---|
| Your own computer, GitHub Actions | Local Supabase stack: `npx supabase start` (Docker) | Normal Supabase workflow; disposable; free |
| Claude Code cloud sessions | The free cloud project `restaurant-os-dev` (to be created in Phase 6, `eu-central-1`) plus the plain-Postgres SQL harness in `docs/01-architecture/sql/` | Checked on 9 Nov 2026: the Docker daemon starts in these sessions, but image pulls fail (ECR "Data limit exceeded", Docker Hub 429), so `supabase start` can't run there |

**Never use the existing Supabase project "Exishe's Project".** It holds another product's tables (prospects, approvals, marketing). Our migrations revoke default grants on every table in `public`, which would break that app. Restaurant OS gets its own project, the second of the two free slots, created in Phase 6 after the owner confirms.

## First-time setup

```bash
nvm use 24                      # Node 24 LTS
npm ci
cp .env.example .env.local      # fill in values; see the table below
npx supabase start              # local stack (needs Docker)
npm run db:reset                # apply migrations + seed
npm run db:types                # regenerate src/lib/supabase/types.ts
npm run dev                     # http://localhost:3000
```

The seed prints three links: a guest table link for the demo café, the waiter app pairing code and the kitchen board.

## Scripts

| Script | Runs | When |
|---|---|---|
| `dev` | `next dev` | Local work |
| `build`, `start` | `next build`, `next start` | Before e2e, in CI |
| `lint` | `eslint .` | Every commit (CI) |
| `typecheck` | `tsc --noEmit` | Every commit (CI) |
| `test` | `vitest run` | Every commit (CI) |
| `test:db` | `supabase test db` (pgTAP in `supabase/tests`) | Pull requests (CI), after every migration |
| `test:sql` | The plain-Postgres harness (`docs/01-architecture/sql/`) | Cloud sessions without Docker |
| `test:e2e` | `playwright test --trace off` | Pull requests (CI), each milestone |
| `db:reset` | `supabase db reset` | After pulling new migrations |
| `db:types` | `supabase gen types --local > src/lib/supabase/types.ts` | After every migration |
| `db:advisors` | `supabase db advisors` | After every migration (CI fails on security warnings) |
| `check` | lint + typecheck + test | Before every commit |

## Migrations

We write imperative migrations by hand, starting from the validated target schema in `docs/01-architecture/sql/10-schema.sql`.

1. `npx supabase migration new <what_changes>`. Let the CLI name the file; never invent timestamps.
2. Write the SQL. Every migration that adds a table or function ends with the same checklist:
   - `alter table … enable row level security` and the policies for that table;
   - `revoke all on <table> from anon, authenticated`, then explicit grants;
   - `revoke execute on function … from public, anon, authenticated`, then explicit grants;
   - `security definer` functions have `set search_path = ''` and assert the caller's role.
3. `npm run db:reset && npm run test:db && npm run db:advisors && npm run db:types`.
4. Commit the migration, the pgTAP tests and the regenerated types together.
5. Hosted projects get migrations only through `supabase db push`. In CLI v3 that asks for confirmation; CI passes `--yes` only on the deploy job. Nobody changes a hosted schema by hand.

## Seed data

`supabase/seed.sql` creates the fictional «Դեմո սրճարան» / "Demo Café" with one location, 12 tables in two areas, a kitchen and a bar station, and a menu of about 40 items in hy, ru and en. The prices are plausible for central Yerevan in 2026; they're illustrative, not copied from a real café. A sample:

| Category | hy | ru | en | AMD |
|---|---|---|---|---|
| Breakfast | Լոլիկով ձվածեղ | Яичница с помидорами | Scrambled eggs with tomatoes | 1 800 |
| Breakfast | Ժենգյալով հաց | Женгялов хац | Zhingyalov hats (herb flatbread) | 1 500 |
| Hot dishes | Տոլմա | Толма | Tolma (stuffed grape leaves) | 3 200 |
| Khorovats | Խոզի չալաղաջ | Хоровац из свиной корейки | Pork rib khorovats | 4 200 |
| Khorovats | Հավի խորոված | Хоровац из курицы | Chicken khorovats | 3 300 |
| Salads | Ամառային աղցան | Летний салат | Summer salad | 1 600 |
| Salads | Ցեզար աղցան հավով | Цезарь с курицей | Caesar salad with chicken | 3 100 |
| Bakery | Գաթա | Гата | Gata (sweet bread) | 900 |
| Bakery | Լահմաջո | Ламаджо | Lahmajo | 900 |
| Coffee and tea | Հայկական սուրճ | Армянский кофе | Armenian coffee | 700 |
| Coffee and tea | Կապուչինո | Капучино | Cappuccino (sizes: 250 ml, 350 ml +300) | 1 300 |
| Coffee and tea | Ուրցով թեյ | Чай с чабрецом | Thyme tea | 900 |
| Drinks | «Ջերմուկ» հանքային ջուր | Минеральная вода «Джермук» | Jermuk mineral water | 600 |
| Drinks | Թարմ քամված նարնջի հյութ | Свежевыжатый апельсиновый сок | Fresh orange juice | 1 600 |
| Drinks | Թան | Тан | Tan (yogurt drink) | 600 |

Coffee and drinks route to the bar station, everything else to the kitchen. Two items carry `source = 'ai'` translations that are already reviewed, so the publish rule is exercised by the seed.

## Environment variables

`.env.example` lists every variable with an empty value. `src/lib/env.ts` validates them with Zod at startup, so a missing secret fails the build, not a guest's request.

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | `sb_publishable_…` |
| `APP_BASE_URL` | server | Used in QR codes and Telegram links |
| `AI_PROVIDER` | server | `gemini` while the free rule holds, `claude` later |
| `GEMINI_API_KEY` | server | Free tier |
| `ANTHROPIC_API_KEY` | server | Empty until paid is allowed |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Cloudflare Turnstile; the secret goes into Supabase Auth's CAPTCHA setting |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | public | EU host |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | public / CI only | The auth token is only for source-map upload in CI |

Secrets that the database itself uses live in Supabase Vault, not in env vars (ADR-038): `qr_key_<kid>` and `telegram_webhook_secret` are generated inside the database; `telegram_bot_token` is pasted once by the owner in the dashboard (Project Settings → Vault).

Secrets are never committed. `.env*.local` is in `.gitignore`, and a pre-commit secret scan (gitleaks in CI) backs that up.

## Branches, CI and previews

- One branch per milestone from `docs/06-build/plan.md`, then a pull request. CI must pass before merge.
- GitHub Actions (`.github/workflows/ci.yml`):
  - Every push: `npm ci`, `lint`, `typecheck`, `test`, license allowlist, `npm audit --audit-level=high`.
  - Pull requests: also `supabase start` → `db:reset` → `test:db` → `db:advisors`, then `build` → `test:e2e` against the local stack at 390 px (phone), 820 px (tablet) and 1280 px (desktop).
  - Free minutes are limited for private repositories, which is why the heavy job runs on pull requests only.
- Vercel previews: the Git integration builds every branch push into a preview URL. Preview env vars point to `restaurant-os-dev`. Previews are protected with Vercel Authentication so strangers can't use the demo café. Production deploys happen only when the owner explicitly says so (brief, section 2).
- Before any deploy: the security review from the brief (auth, RLS, public endpoints, secrets, injection, rate limits), semgrep, and a re-run of the dependency audit.

## Backups while on Supabase Free

The Free plan has no backups. `.github/workflows/db-backup.yml` runs nightly: `supabase db dump` against the live project using a connection string stored as a GitHub secret, encrypts the dump with `age` using a key held only by the owner, and uploads it as a workflow artifact kept for 30 days. A restore drill runs once in Phase 4. The job goes away when we move to Supabase Pro.

## Notes for Claude Code cloud sessions

- Docker images can't be pulled (see the top of this file). Use the dev cloud project through the Supabase MCP tools or CLI, and the plain-Postgres harness for SQL tests. A throwaway Postgres 16 runs fine locally under the `postgres` user.
- Playwright 1.63 and Chromium come preinstalled. The project pins `@playwright/test` 1.65, so `playwright.config.ts` reads `PW_CHROMIUM_PATH` and, when set, launches `/opt/pw-browsers/chromium`. CI installs its own browsers.
- Screenshots meant for the owner use `deviceScaleFactor: 2`; checks only Claude reads use 1.
- The free rule and the other working rules live in `CLAUDE.md` at the repository root, so every new session follows them.
