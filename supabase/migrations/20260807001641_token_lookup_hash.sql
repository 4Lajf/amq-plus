-- No-op stub. The token_sha256 column and its index were applied to production
-- out of band during the recovery session; this file exists so the local
-- migration list matches `supabase_migrations.schema_migrations` (version AND
-- name) and `supabase db push` does not report a diverged history.
--
-- The real DDL lives in 20260807000000_token_lookup_hash.sql and is idempotent.

select 1;
