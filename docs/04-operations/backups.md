# Backups and test-data clean-up (pilot readiness)

Both jobs are free: GitHub Actions and the database's own `pg_cron` (ADR-050). The restore steps are runbook RB5 in `reliability.md`.

## 1. Nightly database backup

Workflow: `.github/workflows/backup.yml`. Runs every day at 03:17 UTC and on demand (Actions → "Database backup" → Run workflow). Permissions are `contents: read` only.

What it does:

1. Runs `supabase db dump` against project `mhuxfmdehkgpjunxgptc` three times: schema, data (`--data-only --use-copy`), and the `auth` schema data (users and identities, which the Supabase CLI leaves out unless asked, but café data points at them).
2. Writes the dumps to files only (stdout is discarded, nothing is echoed), packs them into one `pativ-db-<date>.tar.gz`.
3. If the `BACKUP_AGE_PUBLIC_KEY` secret is set, encrypts it with `age` to `.tar.gz.age`; otherwise warns and uploads the plain `.tar.gz`.
4. Uploads it as the workflow artifact `db-backup`, kept 14 days.

### Secrets (Settings → Secrets and variables → Actions)

| Secret | Needed | What |
|---|---|---|
| `SUPABASE_DB_PASSWORD` | One of these two | The project's database password (Supabase dashboard → Project Settings → Database). Yes: a dump connects to Postgres, so the access token alone is not enough. |
| `SUPABASE_DB_URL` | One of these two | Full session-mode pooler connection string (dashboard → Connect → Session pooler, port 5432). Wins over the password. Use it if the pooler host differs from the default below. |
| `BACKUP_AGE_PUBLIC_KEY` | Recommended | An `age` public key (`age-keygen`); keep the private key offline. The dump holds staff emails and order history, so encrypt it. |
| `SUPABASE_ACCESS_TOKEN` | Already set | Passed to the CLI; not enough for a dump alone. |

With neither `SUPABASE_DB_PASSWORD` nor `SUPABASE_DB_URL`, the workflow ends green with `::notice::` and makes no backup.

GitHub's runners have no IPv6 and Supabase's direct database host is IPv6-only, so the workflow connects through the pooler. With only the password set it builds `aws-0-eu-central-1.pooler.supabase.com:5432` (Frankfurt). If the first run fails to connect, copy the exact pooler string from the dashboard into `SUPABASE_DB_URL`. Not yet run for real: the first scheduled or manual run is the proof, and the owner should do the restore drill (RB5) once.

## 2. Automatic clean-up of test data

Migration `20261110140000_purge_test_data`; pg_cron job `pativ-purge-test-data`, daily 02:40 UTC (06:40 Yerevan). It also runs once when the migration is applied.

`private.purge_test_cafes(p_older_than interval default '1 day')` deletes a café (everything cascades from the `restaurants` row) only when all of these hold:

- its slug is not `demo-cafe`;
- it is older than the interval;
- it has at least one owner;
- every person member (devices are ignored) has an auth email ending in `@pativ.test`, case-insensitive. One real member of any role keeps the café.

Then it deletes auth users whose email ends in `@pativ.test`, older than the interval, who belong to no café and are not platform admins. A user still referenced by a row that does not cascade is skipped.

Not touched: any café with a real person, the demo café, anonymous auth users (guests and paired devices; they count toward monthly active users, so a separate sweep may be worth adding later).

`private.purge_demo_activity(p_older_than interval default '1 day')` clears orders (with items, tickets, history), bills (lines, payments), service requests, guest sessions and table sessions of `demo-cafe` older than the interval. Its menu, tables, stations and subscription stay.

Both functions are `SECURITY DEFINER`, `search_path = ''`, and executable by the database owner only (revoked from `public`, `anon`, `authenticated`). Tests: `supabase/tests/sql/z_purge_test_data.sql`.

Check the last run: `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'pativ-purge-test-data') order by start_time desc limit 3;`

Before the pilot café signs up, make sure its owner's email does not end in `@pativ.test`.
