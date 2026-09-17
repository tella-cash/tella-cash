-- Retire Twilio as a WhatsApp provider — apply BEFORE the code that removes it.
--
-- WhatsApp now runs only on the Meta Cloud API. Rows still saying 'twilio'
-- would route outbound messages to a provider the code no longer has, so they
-- move to 'meta'. The phone number is stored as `whatsapp:+E164` for both, so
-- the same row keeps matching inbound Meta messages.
--
-- On a fresh project (the recommended mainnet setup) this only changes the
-- column default, since no 'twilio' rows exist.
--
-- Apply via Supabase SQL editor or
-- `psql "$SUPABASE_DATABASE_URL" -f migrations/0025_retire_twilio.sql`.

alter table public.tella_users
  alter column whatsapp_channel set default 'meta';

update public.tella_users
   set whatsapp_channel = 'meta'
 where whatsapp_channel = 'twilio';

-- A user who messaged through both providers has two channel rows for the
-- same number. Keep the meta one, carrying primary over if twilio held it.
update public.tella_user_channel m
   set is_primary = true
  from public.tella_user_channel t
 where t.provider = 'twilio'
   and m.provider = 'meta'
   and m.external_id = t.external_id
   and m.user_id = t.user_id
   and t.is_primary;

delete from public.tella_user_channel t
 using public.tella_user_channel m
 where t.provider = 'twilio'
   and m.provider = 'meta'
   and m.external_id = t.external_id;

update public.tella_user_channel
   set provider = 'meta'
 where provider = 'twilio';

-- Sanity check after applying (both 0):
--   select count(*) from tella_users where whatsapp_channel = 'twilio';
--   select count(*) from tella_user_channel where provider = 'twilio';
