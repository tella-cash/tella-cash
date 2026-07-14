-- Persisted transaction history. Nothing survives a completed send today
-- (tella_pending_action rows are deleted immediately before/after use), so
-- the "history" command needs its own table. Apply via Supabase SQL editor
-- or `psql $SUPABASE_DB_URL -f migrations/0004_transactions.sql`.

create table if not exists public.tella_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete cascade,
  direction text not null check (direction in ('sent', 'received')),
  amount_usdc text not null,
  amount_ngn text not null,
  token text not null default 'USDC',
  counterparty_label text,
  counterparty_address text,
  tx_hash text,
  circle_transaction_id text,
  status text not null default 'submitted' check (status in ('submitted', 'complete')),
  created_at timestamptz not null default now()
);

create index if not exists tella_transactions_user_id_created_at_idx
  on public.tella_transactions(user_id, created_at desc);
