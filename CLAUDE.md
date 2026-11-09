# Restaurant OS — working rules

Armenian-first cloud platform for small cafés in Yerevan (QR menu, waiter app, kitchen display, owner admin). The full brief is `docs/brief.md`. Phase docs are in `docs/00-research` … `docs/06-build`.

## Owner's standing instructions

- **Free only.** Since 9 Nov 2026 the owner has said: use only free plans and free services until they say otherwise. No paid tiers, no paid APIs, no purchases. Concretely:
  - AI runs on the Gemini free tier (`AI_PROVIDER=gemini`); the Claude adapter exists but stays off.
  - Supabase Free plan, Vercel Hobby, and the other free tiers listed in `docs/02-stack/stack.md`.
  - If a task can't be done for free, stop and ask; don't work around it with a paid service.
- **Gates.** Work in the brief's phases and stop at each gate until the owner replies "go".
- **Production.** Vercel preview deploys only. Production only when the owner explicitly says so.
- **Ask only for real decisions** (pricing, brand name, which bank, money, anything irreversible). Make sensible calls otherwise and record them in `docs/01-architecture/decisions.md`.

## Do not touch

- The Supabase project "Exishe's Project" (ref `yvhbmwlbffyuowxjcafy`) belongs to another product. Never run migrations, SQL or seeds against it. Restaurant OS uses its own project.
- No code from AGPL or unlicensed repositories (see `docs/00-research/reference-analysis.md`). Reference clones live in `/tmp/refs/`, never in this repo.
- Never commit secrets. `.env.local` locally, `.env.example` in git.

## How we build

- Plan before code. Verify before saying something is done: run it, test it in a real browser (Playwright), check the console.
- Bugs: reproduce first, find the root cause, fix only what's broken, keep the existing style.
- Business rules live in Postgres functions; clients read through RLS. Every migration follows the checklist in `docs/02-stack/dev-workflow.md`.
- Code, comments and docs in English. UI text only through `messages/{hy,ru,en}.json`. Armenian text follows the `hy-writer` skill (reformed spelling, ։ ՝ ՞ « »), `lang="hy"`.
- Use cheaper subagents (Sonnet, Haiku) for mechanical work: scanning, searching, boilerplate, running tests.
- At the end of each phase, list the skills used.

## Cloud-session notes

- Docker starts but can't pull images here, so `supabase start` doesn't work in cloud sessions. Use the dev cloud project and the plain-Postgres harness in `docs/01-architecture/sql/`.
- Develop on the branch named in the session instructions; commit and push there.
