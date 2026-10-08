-- Schema drift repair: `training_tokens.revoked` exists in production (added
-- out of band) but was never in a migration file. lookupToken() filters on it
-- (src/lib/server/training/training-utils.js), so any environment built from
-- this directory alone - a Supabase branch, staging, `supabase start` - gets a
-- PostgREST 42703 on the fast path and silently degrades EVERY request to the
-- full bcrypt scan the token_sha256 work exists to eliminate.
--
-- Idempotent, so it is a no-op against production.

alter table public.training_tokens
  add column if not exists revoked boolean not null default false;

comment on column public.training_tokens.revoked is
  'Soft-revocation flag. lookupToken() filters on this; POST /api/training/token/revoke currently hard-deletes instead.';

-- Only non-revoked tokens are ever looked up, so keep the index off the dead rows.
create index if not exists idx_training_tokens_active_sha256
  on public.training_tokens (token_sha256)
  where token_sha256 is not null and revoked = false;
