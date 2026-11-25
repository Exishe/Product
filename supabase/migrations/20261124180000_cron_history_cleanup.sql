-- Scheduler housekeeping (ADR-089). pg_cron keeps a row per run in
-- cron.job_run_details and never deletes them. With the 10-second
-- notification job that is ~10,000 rows a day; on the free database the
-- table's own updates reached 142 s at peak (pg_stat_statements, 25 Nov).
-- Keep two days of history, cleaned nightly at 03:30 UTC (07:30 Yerevan, before cafés open).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'pativ-purge-cron-history') then
      perform cron.unschedule('pativ-purge-cron-history');
    end if;
    perform cron.schedule('pativ-purge-cron-history', '30 3 * * *',
      $job$delete from cron.job_run_details where end_time < now() - interval '2 days'$job$);
  else
    raise notice 'pg_cron is not available: run history is not cleaned by a job';
  end if;
end $$;
