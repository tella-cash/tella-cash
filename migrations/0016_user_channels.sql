-- Multi-channel identity — apply BEFORE deploying the code that uses it.
--
-- A tella user currently IS a phone number. tella_users.whatsapp_number is
-- the lookup key and tella_users.whatsapp_channel names the one provider they
-- are reachable on. findOrCreateUser goes further and UPDATES that column
-- whenever a message arrives on a different provider, so it records "the
-- channel last used", not "the channels available", and clobbers the previous
-- one every time.
--
-- That is the single thing standing between this app and a second channel,
-- and it has to change before a Telegram message can arrive at all: the
-- CHECK constraint from 0002 only permits 'twilio' and 'meta', so the first
-- Telegram user would make findOrCreateUser throw.
--
-- EXPAND ONLY. THIS MIGRATION DOES NOT DROP ANYTHING.
--
-- tella_users.whatsapp_number and .whatsapp_channel are read by notify.ts,
-- both token pages, findUserByWhatsApp, the beneficiary lookup and the
-- follow-up path. Dropping them in the same migration that introduces their
-- replacement is how a live wallet breaks. They stay, they keep being
-- written, and the contract migration happens separately once this table has
-- been authoritative in production long enough to trust.
--
-- external_id is whatever that provider calls the person: a `whatsapp:+E164`
-- string for Twilio and Meta (they already share a format, normalised in the
-- Meta route), and a numeric chat_id for Telegram. Never a Telegram @handle —
-- those are mutable and reassignable, which is the same class of bug as
-- matching a Google account on email instead of subject id.
--
-- UNIQUE on (provider, external_id) rather than on external_id alone: two
-- providers may legitimately hand out colliding identifiers, and the pair is
-- what actually identifies someone.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0016_user_channels.sql`.

create table if not exists public.tella_user_channel (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete cascade,

  provider text not null check (provider in ('twilio', 'meta', 'telegram')),
  external_id text not null,

  -- Cosmetic, for a future "which devices can reach my account" screen.
  display_name text,

  -- Where conversational replies go. Security notices go everywhere.
  is_primary boolean not null default false,

  -- Set when the channel was proved to belong to this user: for WhatsApp by
  -- the inbound message itself, for Telegram by consuming a single-use link
  -- token minted on an already-authenticated channel.
  verified_at timestamptz,

  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),

  unique (provider, external_id)
);

create index if not exists tella_user_channel_user_id_idx
  on public.tella_user_channel(user_id);

alter table public.tella_user_channel enable row level security;

-- Backfill: one row per existing user, from the columns that are staying.
-- Verified as of now, since these users have all demonstrably messaged us on
-- that channel — that is how their row came to exist.
insert into public.tella_user_channel (user_id, provider, external_id, is_primary, verified_at)
select u.id, u.whatsapp_channel, u.whatsapp_number, true, u.created_at
  from public.tella_users u
 where u.whatsapp_number is not null
on conflict (provider, external_id) do nothing;

-- Sanity check after applying — the counts should match, and every user
-- should have exactly one primary channel:
--
--   select
--     (select count(*) from public.tella_users) as users,
--     (select count(*) from public.tella_user_channel) as channels,
--     (select count(*) from public.tella_user_channel where is_primary) as primaries;
