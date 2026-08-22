-- Widen the recovery-token kinds — apply BEFORE the code that uses it.
--
-- 0010 created tella_security_token with `kind` constrained to 'pin_reset'
-- and a comment saying it left room for future recovery kinds. This is that
-- room being used: linking a Telegram account reuses the same mint-once,
-- consume-once, short-TTL primitive rather than growing a second one.
--
-- APPLY THIS TOGETHER WITH THE revokeResetTokens FIX, NOT AFTER IT.
--
-- revokeResetTokens (lib/security/reset-tokens.ts) marks every unused token
-- for a user as consumed, filtered only on user_id. That is correct today,
-- because 'pin_reset' is the only kind that exists — but the moment a second
-- kind exists, completing a PIN reset silently kills an in-flight channel
-- link, and the user sees a Telegram deep link that simply does nothing.
--
-- A widened constraint without the kind filter is a latent bug shipped on
-- purpose, so the two land in the same change.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0017_security_token_kinds.sql`.

alter table public.tella_security_token
  drop constraint if exists tella_security_token_kind_check;

alter table public.tella_security_token
  add constraint tella_security_token_kind_check
  check (kind in ('pin_reset', 'link_telegram'));

-- Payload for kinds that need to carry state across the two halves of a
-- multi-step flow without inventing a session. A channel link stores nothing
-- today, but the column costs nothing empty and retrofitting it would mean a
-- second migration against a table on the recovery path.
alter table public.tella_security_token
  add column if not exists payload jsonb;
