-- Account freeze / kill switch — apply BEFORE deploying the code that uses it.
--
-- Until now a user who believed they were compromised had nothing to do
-- about it. Every control in this app sits in front of a single transfer:
-- the PIN, the passkey, the per-transfer cap. None of them stop an attacker
-- who holds the phone and can therefore satisfy all three, one send at a
-- time. The only thing that helps at that point is a way for the user to
-- turn outbound money off entirely, faster than the attacker can move it.
--
-- The design principle, stated here because every rule below follows from
-- it: FREEZING IS CHEAP AND UNFREEZING IS EXPENSIVE. A freeze that fires
-- wrongly costs one person an afternoon; a drain that is not stopped costs
-- them the money. Those are not comparable, so they do not get comparable
-- proof. Freeze accepts weak evidence from any channel, including a plain
-- chat message with no factor at all. An attacker can freeze an account
-- too, and that is fine, because freezing does not help them.
--
-- WHY NOT A wallet_status VALUE
--
-- `wallet_status` describes PROVISIONING ('none' | 'pending' | 'active' |
-- 'failed'), and listUsersNeedingWallet (lib/users/repository.ts) selects
-- on it to feed the retry-wallets cron. A 'frozen' value there would make
-- that job treat a frozen account as a wallet that failed to provision,
-- and a successful retry would call setWalletActive and silently clear the
-- freeze. A nullable timestamp is also the idiom this schema already uses
-- for every one-way state change: claimed_at, used_at, locked_until.
--
-- WHAT A FREEZE DOES NOT DO
--
-- It does not block inbound. Money arriving in a frozen wallet is just
-- money that cannot leave, and the "you received X" notification is often
-- how a user notices something is wrong in the first place. It also does
-- not block a frozen user from being SENT to by someone else — that check
-- reads the recipient's row, and refusing there would leak one user's
-- security state to another user.
--
-- THE PANIC CODE
--
-- panic_code_hash is a scrypt hash (lib/auth/pin.ts format) of a code
-- issued once, at enrollment, for the case that matters most: the phone is
-- gone, so the chat channel is gone with it. It is the one credential that
-- works from a borrowed device. It can ONLY freeze. It cannot unfreeze,
-- authorize a send, or change a factor, which is what makes it safe to
-- accept over any channel and safe to write down.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0012_account_freeze.sql`.

alter table public.tella_users
  add column if not exists frozen_at timestamptz,
  add column if not exists frozen_reason text,
  add column if not exists frozen_source text,
  add column if not exists panic_code_hash text;

-- Frozen accounts are rare and always read by "is this one frozen", so a
-- partial index is both smaller and the only shape that gets used.
create index if not exists tella_users_frozen_at_idx
  on public.tella_users(frozen_at) where frozen_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tella_users_frozen_source_check'
  ) then
    alter table public.tella_users
      add constraint tella_users_frozen_source_check
      check (frozen_source is null or frozen_source in
        ('whatsapp', 'telegram', 'panic_code', 'web', 'operator', 'auto'));
  end if;
end
$$;

-- Sanity check after applying:
--
--   select id, frozen_at, frozen_source from public.tella_users
--    where frozen_at is not null;
