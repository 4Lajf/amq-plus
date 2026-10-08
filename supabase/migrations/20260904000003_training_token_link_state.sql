-- A token existing only means it is ready to paste. It becomes linked once the
-- connector successfully validates it and updates last_used_at.
alter table public.training_tokens
  alter column last_used_at drop not null,
  alter column last_used_at drop default;

-- Historical rows created with both defaults have identical timestamps until
-- the connector validates them. Preserve every timestamp that actually moved.
update public.training_tokens
set last_used_at = null
where last_used_at = created_at;

