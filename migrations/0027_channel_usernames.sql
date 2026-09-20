-- Pay a Telegram user by their @username — apply BEFORE the code that uses it.
--
-- A channel-rooted account (0026) has no phone number, so nothing could
-- address it: "send 5 to @ada" had nowhere to look. Telegram usernames are
-- unique at any moment and people already share them the way they share a
-- number, so they are the natural handle for those accounts.
--
-- WHY A COLUMN RATHER THAN REUSING display_name
--
-- display_name is cosmetic: it is whatever the provider last called the
-- person, it can be blank, and nothing depends on it. This one decides where
-- money goes, so it gets its own column, its own uniqueness, and its own
-- refresh rule.
--
-- THE THING TO UNDERSTAND ABOUT TELEGRAM USERNAMES
--
-- They are unique but NOT permanent. A person can drop @ada and somebody else
-- can take it an hour later. A stored mapping is therefore a snapshot, and a
-- stale one would send money to the previous holder — the exact mistake this
-- feature must not make.
--
-- Two things keep it honest, both in lib/messaging/channels.ts:
--   * every inbound message refreshes the sender's username, so the row
--     tracks reality as soon as its owner speaks;
--   * claiming a username clears it from any other row, because Telegram
--     guarantees only one holder at a time and the newest claim is the true
--     one.
-- The unique index below is what makes the second one enforceable rather than
-- merely intended.
--
-- Case is not significant to Telegram, so the index is on lower(username).
--
-- Apply via Supabase SQL editor or
-- `psql "$SUPABASE_DATABASE_URL" -f migrations/0027_channel_usernames.sql`.

alter table public.tella_user_channel
  add column if not exists username text;

-- Backfill: linkAccount stored the Telegram username in display_name, so for
-- telegram rows that value IS the handle. Anything already duplicated is left
-- for the index below to reject, which is the loud failure that wants a look.
update public.tella_user_channel
   set username = display_name
 where provider = 'telegram'
   and display_name is not null
   and username is null;

create unique index if not exists tella_user_channel_username_unique
  on public.tella_user_channel (provider, lower(username))
  where username is not null;

-- Sanity check after applying — no two rows hold the same handle:
--
--   select provider, lower(username), count(*)
--     from tella_user_channel
--    where username is not null
--    group by 1, 2 having count(*) > 1;   -- expected: no rows
