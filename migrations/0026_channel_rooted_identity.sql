-- Let a channel be an identity on its own — apply BEFORE the code that uses it.
--
-- Until now a tella account WAS a phone number: tella_users.whatsapp_number
-- was NOT NULL and unique, so only a channel carrying a phone number could
-- create an account. Telegram carries a chat id and nothing else, which is
-- why an unknown Telegram chat was answered with "this account isn't
-- connected to a tella wallet yet, start on WhatsApp".
--
-- That dead end was the whole objection: Telegram should be somewhere a
-- person can simply start, with no WhatsApp and nothing to link.
--
-- TWO CHANGES, AND WHAT EACH COSTS
--
-- 1. whatsapp_number becomes nullable. Postgres treats NULLs as distinct in a
--    unique index, so any number of phone-less accounts coexist while a real
--    number stays unique. What a phone-less account gives up is being payable
--    BY number: findUserByWhatsApp cannot find them, so "send 5 to +234…"
--    still answers "that number isn't on tella yet", and the panic-code page,
--    which is keyed on a phone number, cannot reach them either. They send
--    and receive by wallet address, and by any channel they later link.
--
-- 2. whatsapp_channel admits 'telegram'. The column is misnamed for what it
--    has become — the user's PRIMARY channel, where conversational replies
--    and the "back to chat" link go. Left named as it is rather than renamed
--    across a dozen call sites during a mainnet cutover; the check constraint
--    is what actually has to change.
--
-- Apply via Supabase SQL editor or
-- `psql "$SUPABASE_DATABASE_URL" -f migrations/0026_channel_rooted_identity.sql`.

alter table public.tella_users
  alter column whatsapp_number drop not null;

alter table public.tella_users
  drop constraint if exists tella_users_whatsapp_channel_check;

alter table public.tella_users
  add constraint tella_users_whatsapp_channel_check
  check (whatsapp_channel in ('meta', 'telegram'));

-- Sanity checks after applying:
--
--   select is_nullable from information_schema.columns
--    where table_name = 'tella_users' and column_name = 'whatsapp_number';  -- YES
--
--   -- every account is reachable somehow: a number, a channel row, or both
--   select count(*) from tella_users u
--    where u.whatsapp_number is null
--      and not exists (select 1 from tella_user_channel c where c.user_id = u.id);
--   -- expected 0
