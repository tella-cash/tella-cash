-- Sends that wait for a sweep.
--
-- A user's USDC can sit on Base while a send leaves from Arc. When a confirmed
-- send needs Arc to be topped up first, the send cannot happen yet and must
-- not be lost, so it is parked here with the legs of the sweep that will fund
-- it. When every leg has minted on Arc the advance job runs the send, having
-- re-derived permission from scratch (see lib/sweeps/settle.ts).
--
-- Same family as tella_held_send and for the same reason it is not that table:
-- a hold waits for TIME, this waits for MONEY, and the release-holds job must
-- never pick one of these up.
--
-- Apply after 0029 and 0030. Nothing reads or writes it until
-- TELLA_SWEEP_SENDS=on, so it is safe to apply early.

create table if not exists public.tella_sweep_send (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete cascade,

  -- The authorized send, carried over verbatim like a held send's. The amount
  -- is fixed at authorization and never recomputed.
  payload jsonb not null,

  -- What the user was shown: fees, legs, ceilings, as integer micro-USDC text.
  -- Executed from this snapshot, never from whatever the fee config says later.
  quote jsonb not null,

  state text not null default 'sweeping'
    check (state in ('sweeping', 'executing', 'sent', 'failed', 'unknown', 'cancelled')),

  -- Why it was cancelled, for a person. Never shown to the user verbatim.
  detail text,

  -- Circle's transaction id once the transfer is submitted.
  circle_transaction_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tella_sweep_send_open_idx
  on public.tella_sweep_send (created_at)
  where state = 'sweeping';

create index if not exists tella_sweep_send_user_state_idx
  on public.tella_sweep_send (user_id, state);

alter table public.tella_sweep_send enable row level security;

-- Which send a sweep leg is funding. Null for a sweep nobody parked a send for.
alter table public.tella_sweeps
  add column if not exists sweep_send_id uuid references public.tella_sweep_send(id) on delete restrict;

create index if not exists tella_sweeps_send_idx
  on public.tella_sweeps (sweep_send_id)
  where sweep_send_id is not null;
