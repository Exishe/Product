-- Expose the api schema to the Data API (PostgREST reads pgrst.* settings
-- from the authenticator role), then reload its configuration.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, api';
notify pgrst, 'reload config';
