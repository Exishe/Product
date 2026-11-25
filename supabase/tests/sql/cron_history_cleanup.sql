-- Scheduler housekeeping (ADR-089): a nightly job trims pg_cron's run history.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select test.ok(exists (select 1 from cron.job
                       where jobname = 'pativ-purge-cron-history' and schedule = '30 3 * * *'
                         and command like '%cron.job_run_details%interval ''2 days''%'),
               'a nightly job keeps two days of scheduler history');
