-- Mainnet readiness — apply BEFORE the code that uses it.
--
-- Three unrelated changes that share one deadline: they all have to be in the
-- database before ARC_NETWORK=ARC is ever set.
--
-- 1. tella_users.wallet_network
--
--    Which Arc network a user's Circle wallet was created on. Nothing recorded
--    it, so a deployment switched to mainnet on this database would still
--    treat every testnet wallet as active: a phone-number send to an existing
--    user would move real USDC to an address created under the testnet Circle
--    entity, which the mainnet entity cannot sign for. lib/users/wallet-gate.ts
--    now refuses any wallet whose network is not the deployment's.
--
--    Backfilled to ARC-TESTNET, which is the only network any wallet created
--    before this migration can be on.
--
-- 2. tella_users.factors_changed_at
--
--    When the account's security setup last changed in a way an attacker
--    holding the chat could cause: a PIN reset, passkeys removed, a Telegram
--    or Google account linked. A PIN reset needs nothing but the chat, so for
--    a window after one of these every send is held (lib/sends/tiers.ts) and
--    linking another channel is refused. Null means "not since this column
--    existed", which is the right reading for every existing account.
--
-- 3. Revoke EXECUTE on the SECURITY DEFINER lockout functions.
--
--    Postgres grants EXECUTE on new functions to PUBLIC. These two run with
--    the owner's rights and bypass RLS, so anyone holding the project's anon
--    key could call tella_reset_auth_attempts through PostgREST and wipe a
--    PIN lockout. The app never ships the anon key, so this was not reachable
--    today; it should not depend on that staying true. The service role keeps
--    its grant.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DATABASE_URL -f migrations/0024_mainnet_readiness.sql`.

alter table public.tella_users
  add column if not exists wallet_network text;

update public.tella_users
   set wallet_network = 'ARC-TESTNET'
 where circle_wallet_id is not null
   and wallet_network is null;

alter table public.tella_users
  drop constraint if exists tella_users_wallet_network_check;

alter table public.tella_users
  add constraint tella_users_wallet_network_check
  check (wallet_network is null or wallet_network in ('ARC-TESTNET', 'ARC'));

alter table public.tella_users
  add column if not exists factors_changed_at timestamptz;

revoke execute on function public.tella_record_auth_attempt(uuid, text, int, interval, interval)
  from public, anon, authenticated;
revoke execute on function public.tella_reset_auth_attempts(uuid, text)
  from public, anon, authenticated;
grant execute on function public.tella_record_auth_attempt(uuid, text, int, interval, interval)
  to service_role;
grant execute on function public.tella_reset_auth_attempts(uuid, text)
  to service_role;

-- Sanity checks after applying:
--
--   select count(*) from tella_users
--    where circle_wallet_id is not null and wallet_network is null;   -- 0
--
--   select has_function_privilege('anon',
--     'public.tella_reset_auth_attempts(uuid, text)', 'execute');      -- false
