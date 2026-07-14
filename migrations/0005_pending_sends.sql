-- Dedicated table for pending sends, split out of tella_pending_action.
--
-- tella_pending_action previously upserted on user_id, meaning a user could
-- only ever have ONE pending row — starting a second "send" while the first
-- was still awaiting confirmation silently overwrote it, and worse, the
-- inbound-message router intercepted every message while any pending
-- existed, so a brand new "send X to Y" never even got parsed — the bot
-- just re-showed the stale confirm prompt for the original send.
--
-- Sends now get their own table with no per-user uniqueness, so multiple
-- concurrent pending sends are just separate rows with separate confirm
-- links. tella_pending_action goes back to being beneficiary-conversation
-- state only (still one active conversation at a time, which is correct —
-- see migrations/0003_beneficiaries.sql).
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0005_pending_sends.sql`.

create table if not exists public.tella_pending_send (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete cascade,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists tella_pending_send_user_id_expires_at_idx
  on public.tella_pending_send(user_id, expires_at desc);

-- Old kind='send' rows in tella_pending_action (from before this migration)
-- are short-TTL and left to expire naturally — no data migration needed.
