-- The base schema every later migration assumes — apply FIRST.
--
-- tella_users and tella_pending_action were created by hand in the Supabase
-- SQL editor before this directory existed, so 0001 onwards alter tables that
-- no migration ever created. That was invisible for as long as there was one
-- database; it stops being invisible the moment a second one is set up, where
-- 0001 fails on "relation public.tella_users does not exist".
--
-- Written from the live testnet schema, restricted to what existed before
-- 0001: every column a later migration adds (pin_hash, whatsapp_channel,
-- frozen_at, pin_set_at, wallet_network …) is left to that migration, so
-- applying 0000 through the end reproduces the same database in the same
-- order.
--
-- The original constraint and index names carry the project's two earlier
-- names (upay_, pago_). They are reproduced exactly rather than tidied: a
-- fresh database whose constraint names differ from the live one is a
-- database where an error message from production does not match staging.
--
-- Apply via Supabase SQL editor or
-- `psql "$SUPABASE_DATABASE_URL" -f migrations/0000_base_schema.sql`.

create extension if not exists pgcrypto;

-- Stamps updated_at on every write. Named for the project as it was then,
-- because the trigger on tella_users refers to it by that name.
create or replace function public.upay_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tella_users (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text not null,
  profile_name text,
  onboarding_step text not null default 'awaiting_name'
    check (onboarding_step in ('awaiting_name', 'completed')),
  circle_wallet_id uuid,
  wallet_address text,
  wallet_status text not null default 'none'
    check (wallet_status in ('none', 'pending', 'active', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whatsapp_number)
);

create index if not exists upay_users_wallet_address_idx
  on public.tella_users (wallet_address) where wallet_address is not null;
create index if not exists upay_user_circle_wallet_id_idx
  on public.tella_users (circle_wallet_id) where circle_wallet_id is not null;

drop trigger if exists upay_users_updated_at on public.tella_users;
create trigger upay_users_updated_at
  before update on public.tella_users
  for each row execute function public.upay_set_updated_at();

-- One in-flight conversation per user. The unique index on user_id is what
-- makes the repository's upsert-on-user_id work.
create table if not exists public.tella_pending_action (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete cascade,
  -- The original three. 0006 replaces this with ('send', 'flow'), 0021 and
  -- 0023 widen it again; each of those drops the constraint by name first.
  kind text not null
    check (kind in ('send', 'beneficiary_confirm', 'beneficiary_name')),
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists upay_pending_action_user_unique
  on public.tella_pending_action (user_id);
create index if not exists upay_pending_action_expires_idx
  on public.tella_pending_action (expires_at);

-- RLS on, no policies: the app reaches Postgres only through the service
-- role, which bypasses them. 0009 does the same for every table it knows
-- about, and these two were part of that set.
alter table public.tella_users enable row level security;
alter table public.tella_pending_action enable row level security;
