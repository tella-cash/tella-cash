-- Inbound message idempotency — apply BEFORE deploying the code that uses it.
--
-- Both WhatsApp webhooks ack 200 immediately and do the real work inside
-- after(). Neither checks whether it has seen the message before. Twilio's
-- MessageSid and Meta's message id are both logged and both ignored.
--
-- That has been survivable so far only because the failure is quiet. A
-- redelivered message re-runs handleIncomingMessage from the top: a second
-- decode call, a second reply, and — because createPendingSend is a plain
-- insert by design, so a user can hold several confirm links at once — a
-- SECOND confirm link for a send the user asked for once. Two links, one
-- intent, and no way for the code to tell them apart afterwards.
--
-- It becomes unsurvivable the moment retries are added. Phase 3 of this work
-- puts timeouts and a retry around the intent decoder, and a retry loop on
-- top of a non-idempotent handler multiplies exactly the wrong thing. So this
-- lands first, deliberately, before anything is made to retry.
--
-- The shape is a straight copy of tella_processed_notification (0011), which
-- is the same problem solved for Circle and has been correct in production
-- since. Same claim-then-release-on-failure discipline: the insert IS the
-- claim, so two concurrent deliveries race on the primary key and exactly one
-- wins, with no read-then-write gap to lose.
--
-- The key is '{provider}:{providerMessageId}' rather than the bare id.
-- Twilio and Meta mint ids independently and nothing guarantees they will
-- never collide, and Telegram will be a third. Namespacing costs nothing now
-- and cannot be retrofitted once rows exist.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0013_inbound_message_idempotency.sql`.

create table if not exists public.tella_processed_message (
  key text primary key,
  provider text not null,
  message_id text not null,
  processed_at timestamptz not null default now()
);

-- The cleanup job prunes by age. Providers stop retrying within minutes, so
-- a row is only useful for a short window; it is kept a week so a redelivery
-- during an outage still finds its claim.
create index if not exists tella_processed_message_processed_at_idx
  on public.tella_processed_message(processed_at);

alter table public.tella_processed_message enable row level security;
