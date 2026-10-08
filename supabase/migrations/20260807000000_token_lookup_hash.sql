-- Connector auth was an O(n) bcrypt scan: every training endpoint fetched all
-- training_tokens rows and ran bcrypt.compare in a loop until it found a match.
-- At 220 rows that is 7-20s of CPU per request, which is what pushed session
-- start past Cloudflare's origin timeout (524 -> "Unexpected token '<'").
--
-- Tokens are crypto.randomBytes(32), so key stretching protects nothing here.
-- A plain sha256 gives an indexable lookup column.
--
-- Additive and backwards compatible: token_hash stays authoritative for rows
-- that have not been backfilled yet, and lookupToken() backfills lazily on the
-- first successful legacy match.

alter table public.training_tokens
  add column if not exists token_sha256 text;

create unique index if not exists idx_training_tokens_sha256
  on public.training_tokens (token_sha256)
  where token_sha256 is not null;
