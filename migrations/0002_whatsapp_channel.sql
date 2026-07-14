-- Tracks which WhatsApp provider (Twilio vs Meta Cloud API) a user last
-- messaged tella through, so outbound notifications fired from outside the
-- inbound webhook flow (payment-received, send receipts) know which API to
-- call. Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0002_whatsapp_channel.sql`.

alter table public.tella_users
  add column if not exists whatsapp_channel text not null default 'twilio'
    check (whatsapp_channel in ('twilio', 'meta'));
