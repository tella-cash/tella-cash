-- Sweeps: moving a user's USDC from another chain onto Arc, over CCTP.
--
-- Apply BEFORE deploying the code that uses it. Nothing calls it yet, so this
-- is safe to apply early.
--
-- WHY THIS EXISTS
--
-- Sends leave from Arc only. USDC a user was paid on Base is shown in their
-- balance but cannot be sent. A sweep is the one operation that fixes that:
-- burn on Base, Circle mints the same amount on Arc, at the same address.
--
-- A burn cannot be undone, and Circle's mint has been seen to stall (see
-- circlefin/arc-node issue 200). So a sweep is a saga with a row that says
-- exactly how far it got, and a state a person can be pointed at when it
-- cannot go further. That is what this table is.
--
-- THE STEPS (lib/sweeps/advance.ts)
--
--   created          row written, nothing on chain
--   pull_submitted   the user's wallet signed an EIP-3009 authorisation and
--                    tella's sweeper wallet submitted receiveWithAuthorization
--   pulled           that transaction is confirmed: the USDC is in the sweeper
--   approve_submitted / approved
--   burn_submitted   depositForBurnWithHook submitted
--   burned           confirmed on the source chain; Circle is now attesting
--   delivered        Circle reports the mint on Arc complete   (terminal, good)
--   failed           definitively nothing moved                (terminal, safe)
--   stuck            needs a person: funds are in the sweeper or in flight
--
-- 'failed' is only ever written for a sweep that never took the user's money.
-- Anything past the pull that cannot progress is 'stuck', because the honest
-- description of "we hold it and cannot move it" is not "failed".
--
-- ONE IN FLIGHT PER (user, chain). The partial unique index below is what lets
-- the send path ask "is there a sweep already" and get a single answer. A
-- stuck sweep keeps holding its slot on purpose: sweeping again for a user
-- whose last sweep is unresolved would put a second pot of their money in
-- motion before anyone has looked at the first.
--
-- MONEY. Integer micro-USDC (6 decimals) as text, parsed to BigInt in code.
-- Never a float, never rounded.
--
-- Apply via Supabase SQL editor or
-- `psql "$SUPABASE_DATABASE_URL" -f migrations/0029_sweeps.sql`.

create table if not exists public.tella_sweeps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete restrict,
  chain_id uuid not null references public.tella_chains(id) on delete restrict,

  status text not null default 'created' check (status in (
    'created',
    'pull_submitted', 'pulled',
    'approve_submitted', 'approved',
    'burn_submitted', 'burned',
    'delivered', 'failed', 'stuck'
  )),

  -- What was pulled from the user's wallet on the source chain, micro-USDC.
  amount_micro text not null check (amount_micro ~ '^[1-9][0-9]*$'),
  -- The most Circle may keep for the burn and the delivery, micro-USDC. Circle
  -- keeps all of it whether or not it costs that much, so this is a price the
  -- user pays, not a ceiling that usually goes unspent.
  max_fee_micro text not null check (max_fee_micro ~ '^[0-9]+$'),
  -- 1000 (fast) or 2000 (standard).
  finality_threshold integer not null check (finality_threshold in (1000, 2000)),

  -- The user's own address, on both chains. The mint recipient.
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),

  -- The EIP-3009 authorisation. Fixed when the row is written so a crash
  -- between signing and submitting re-signs THE SAME authorisation: the nonce
  -- is single-use on chain, so signing it twice cannot pull twice.
  auth_nonce text not null check (auth_nonce ~ '^0x[0-9a-f]{64}$'),
  auth_valid_before timestamptz not null,

  -- Circle transaction ids for each on-chain step, and the source-chain hash
  -- of the burn (what Iris is asked about).
  pull_circle_tx_id text,
  approve_circle_tx_id text,
  burn_circle_tx_id text,
  burn_tx_hash text,

  -- The Arc mint, once Circle reports it.
  forward_tx_hash text,
  -- Why it stopped, for a person. Never shown to the user verbatim.
  detail text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- When the current step was last confirmed to be waiting on something
  -- outside tella. Drives the "no progress for too long" alert.
  progressed_at timestamptz not null default now(),

  constraint tella_sweeps_nonce_key unique (auth_nonce)
);

-- At most one unresolved sweep per user per chain. See header.
create unique index if not exists tella_sweeps_one_in_flight
  on public.tella_sweeps (user_id, chain_id)
  where status not in ('delivered', 'failed');

-- The advance job's worklist: everything not finished, oldest first.
create index if not exists tella_sweeps_open
  on public.tella_sweeps (progressed_at)
  where status not in ('delivered', 'failed');

-- Reconciliation: find the sweep a Circle transaction belongs to.
create index if not exists tella_sweeps_pull_tx on public.tella_sweeps (pull_circle_tx_id)
  where pull_circle_tx_id is not null;
create index if not exists tella_sweeps_burn_tx on public.tella_sweeps (burn_circle_tx_id)
  where burn_circle_tx_id is not null;

alter table public.tella_sweeps enable row level security;
