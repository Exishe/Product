-- PostgREST's own queries get more time than the 8 s Supabase default (ADR-085).
--
-- PostgREST reads the whole schema (every table, function, grant) into a cache with one
-- big query run as the authenticator role. On the free instance that query took 0.1 to 5 s
-- and, when the database was busy, went over the 8 s role limit. PostgREST then could not
-- build its cache and answered every request with PGRST002 until the project was restarted.
-- Requests from the app run as anon / authenticated, which keep their own, shorter limits
-- (3 s and 8 s), so a slow guest query is still cut off; only the schema read gets room.
alter role authenticator set statement_timeout = '30s';
notify pgrst, 'reload config';
