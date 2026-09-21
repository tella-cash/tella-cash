-- Accept USDC deposited on other EVM chains — apply BEFORE the code that uses it.
--
-- tella has been Arc-only: one Circle wallet per user, on one network. A person
-- who is paid on Base was paid at an address tella never watched, so the money
-- arrived on chain and nobody was told. This adds the two tables that let a
-- user's ONE address be watched on more than one chain.
--
-- THE ADDRESS DOES NOT CHANGE
--
-- Circle's deriveWallet gives a second Circle wallet record on another chain
-- at the SAME address, under the same key. The record is what Circle needs to
-- report balances and fire webhooks for that chain; the address is what the
-- user shares. tella_user_chain_wallets holds those extra records. The Arc
-- wallet stays on tella_users, exactly where every existing query expects it.
--
-- tella_chains: ADD-ONLY, ON PURPOSE
--
-- A row here is a promise that users may be paid on that network. Every user
-- gets a wallet record there, deposits are credited against the usdc_address
-- below, and users are told to expect it. Removing or editing a row after that
-- would leave deposits arriving at a chain tella has stopped watching, or
-- being judged against a different token contract than the one users were
-- paid in. So the table refuses UPDATE and DELETE outright, at the database,
-- rather than relying on the admin screen not offering the buttons.
--
-- usdc_address is the security-critical column. A token is USDC because of its
-- contract, not its name (see lib/wallet/network.ts); this is where "its
-- contract" comes from for every chain other than Arc. A wrong value here
-- credits users with whatever token lives at that address.
--
-- If a row is genuinely wrong, the fix is a deliberate act by someone with
-- database access:
--
--   alter table public.tella_chains disable trigger tella_chains_immutable;
--   -- correct or remove the row
--   alter table public.tella_chains enable trigger tella_chains_immutable;
--
-- network is 'mainnet' or 'testnet' and must match the deployment's
-- ARC_NETWORK. migrations/README.md says mainnet runs on a fresh project, so a
-- database normally holds one kind; the column keeps a shared or migrated one
-- from ever mixing them up. Base is seeded for both.
--
-- Amounts and everything else money-shaped stay text/numeric as elsewhere.
--
-- Apply via Supabase SQL editor or
-- `psql "$SUPABASE_DATABASE_URL" -f migrations/0028_chains.sql`.

create table if not exists public.tella_chains (
  id uuid primary key default gen_random_uuid(),

  -- Stable machine name, lowercase. Used in URLs and logs, never shown as-is.
  slug text not null,
  -- What a person reads: "Base".
  display_name text not null,

  network text not null check (network in ('mainnet', 'testnet')),
  -- Circle's blockchain code for this network: BASE, BASE-SEPOLIA, ARB, ...
  blockchain text not null,

  -- The official USDC contract on this chain, lowercased. See header.
  usdc_address text not null check (usdc_address ~ '^0x[0-9a-f]{40}$'),

  -- CCTP domain id. Not used by deposits, but it is what a later sweep to Arc
  -- needs, and recording it now means adding a chain is one form, once.
  cctp_domain integer not null check (cctp_domain >= 0),

  -- Prefix of a transaction link; the hash is appended. No trailing slash.
  explorer_tx_url text not null check (explorer_tx_url ~ '^https://'),

  added_by text,
  created_at timestamptz not null default now(),

  constraint tella_chains_slug_network_key unique (network, slug),
  constraint tella_chains_blockchain_network_key unique (network, blockchain),
  constraint tella_chains_domain_network_key unique (network, cctp_domain)
);

alter table public.tella_chains enable row level security;

create or replace function public.tella_chains_refuse_change()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'tella_chains is add-only: a network cannot be edited or removed once added (see migrations/0028_chains.sql)';
end;
$$;

drop trigger if exists tella_chains_immutable on public.tella_chains;
create trigger tella_chains_immutable
  before update or delete on public.tella_chains
  for each row execute function public.tella_chains_refuse_change();

-- Base. The two USDC contracts were read on chain and are Circle's FiatToken
-- (name "USD Coin" / "USDC", version 2); the domain is CCTP's.
insert into public.tella_chains
  (slug, display_name, network, blockchain, usdc_address, cctp_domain, explorer_tx_url, added_by)
values
  ('base', 'Base', 'mainnet', 'BASE',
   '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6,
   'https://basescan.org/tx', 'migration 0028'),
  ('base', 'Base', 'testnet', 'BASE-SEPOLIA',
   '0x036cbd53842c5426634e7929541ec2318f3dcf7e', 6,
   'https://sepolia.basescan.org/tx', 'migration 0028')
on conflict do nothing;

-- One row per (user, chain): the Circle wallet record for that user's address
-- on that chain.
create table if not exists public.tella_user_chain_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete cascade,
  -- restrict, not cascade: a chain that users hold wallets on is not removable
  -- even by a trigger bypass without noticing.
  chain_id uuid not null references public.tella_chains(id) on delete restrict,
  circle_wallet_id text not null,
  address text not null,
  created_at timestamptz not null default now(),

  constraint tella_user_chain_wallets_user_chain_key unique (user_id, chain_id),
  -- The webhook resolves a notification by wallet id.
  constraint tella_user_chain_wallets_circle_key unique (circle_wallet_id)
);

alter table public.tella_user_chain_wallets enable row level security;

-- Users whose Arc wallet is on p_wallet_network (ARC or ARC-TESTNET, as stored
-- in tella_users.wallet_network) and who have no record on the given chain yet.
-- Drives the backfill: a chain added after users exist has to reach all of
-- them, in batches, without a URL-length-limited "not in (...)" built in
-- application code.
create or replace function public.tella_users_missing_chain_wallet(
  p_chain_id uuid,
  p_wallet_network text,
  p_limit integer
)
returns table (user_id uuid, circle_wallet_id text)
language sql
stable
as $$
  select u.id, u.circle_wallet_id
  from public.tella_users u
  where u.wallet_status = 'active'
    and u.circle_wallet_id is not null
    and u.wallet_network = p_wallet_network
    and not exists (
      select 1
      from public.tella_user_chain_wallets w
      where w.user_id = u.id and w.chain_id = p_chain_id
    )
  -- Random, not by id. A user whose derive keeps failing would otherwise sit at
  -- the head of every batch and starve everyone behind them.
  order by random()
  limit greatest(p_limit, 1)
$$;

-- Same lockdown as 0024: service role only.
revoke execute on function public.tella_users_missing_chain_wallet(uuid, text, integer)
  from public, anon, authenticated;

-- Which chain a deposit arrived on. NULL means the deployment's Arc network,
-- which is every row that exists today.
alter table public.tella_transactions
  add column if not exists blockchain text;

-- Sanity checks after applying:
--
--   select slug, network, blockchain, cctp_domain from public.tella_chains;
--     -- two rows, both 'base'
--   update public.tella_chains set display_name = 'x';
--     -- must fail: tella_chains is add-only
