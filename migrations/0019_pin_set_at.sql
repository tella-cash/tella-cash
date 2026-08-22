-- When the PIN was set — apply BEFORE the code that uses it.
--
-- Unfreezing is supposed to require a factor that existed BEFORE the freeze.
-- That is the whole property: an attacker who arrived after the freeze cannot
-- produce one. It was enforceable for passkeys, which carry created_at, and
-- silently unenforceable for PINs, which carried no timestamp at all.
--
-- THE HOLE THAT LEFT
--
-- A frozen user may still complete a PIN reset. That is deliberate — they may
-- genuinely need a new PIN before lifting the freeze, and refusing would build
-- a deadlock out of the one feature that exists to help them. It is safe only
-- because a reset does not thaw the account.
--
-- But once unfreezing accepts "you know the PIN", an attacker holding the
-- phone can chain the two: reset the PIN over WhatsApp, then use the PIN they
-- just chose to lift the freeze. Both steps are individually permitted and the
-- combination undoes the kill switch. Recording when the PIN was set is what
-- closes it — a PIN chosen after frozen_at proves nothing about who you are.
--
-- BACKFILL
--
-- Existing PINs are stamped with the account's created_at: the earliest moment
-- the PIN could possibly have been set, so the stored value is never later
-- than the truth. That errs toward letting a legitimate user back in, which is
-- the right direction for accounts that predate this column — checked against
-- the one currently-frozen account first, which has no completed PIN reset
-- after its freeze.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0019_pin_set_at.sql`.

alter table public.tella_users
  add column if not exists pin_set_at timestamptz;

update public.tella_users
   set pin_set_at = created_at
 where pin_hash is not null
   and pin_set_at is null;

-- Sanity check after applying — every account with a PIN should have a
-- timestamp, and no frozen account should have one dated after its freeze:
--
--   select count(*) from tella_users where pin_hash is not null and pin_set_at is null;
--   select id, pin_set_at, frozen_at from tella_users
--    where frozen_at is not null and pin_set_at > frozen_at;
