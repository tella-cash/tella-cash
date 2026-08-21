-- Webhook delivery idempotency — apply BEFORE deploying the code that uses it.
--
-- Circle's webhooks are at-least-once. Every non-2xx, every timeout, every
-- retry policy tick redelivers the same notification, and nothing in
-- app/api/circle-webhook/route.ts deduped them. A redelivered
-- `transactions.inbound` COMPLETE therefore ran the whole handler again: a
-- second "💰 Received 10 USDC" WhatsApp message, and a second
-- tella_transactions row for one on-chain transfer. Two rows of 10 read as
-- 20 in "history" and count twice toward anything that sums the table.
--
-- Two layers here, deliberately.
--
--   1. tella_processed_notification — the claim. An insert of the key is the
--      atomic "I am handling this one"; a duplicate key means someone else
--      already did, so the redelivery returns without side effects. This is
--      what stops the duplicate WhatsApp message, which no database
--      constraint on tella_transactions could.
--
--      The key is `{notificationType}:{notification.id}` rather than the id
--      alone. Circle reuses the id across a transaction's states, and a
--      wallet-to-own-wallet transfer produces both an inbound and an
--      outbound event — keying on the id alone would let one of those
--      swallow the other.
--
--      Rows are claimed only once the state we act on (COMPLETE) has
--      arrived. Claiming on INITIATED would burn the key before the event
--      that matters shows up.
--
--   2. The unique index on tella_transactions — the backstop. If the claim
--      is ever lost (released after a failure, pruned early, a race the
--      claim doesn't cover), the database still refuses a second history row
--      for the same Circle transaction.
--
-- Scoped to (user_id, direction, circle_transaction_id): a self-transfer
-- legitimately produces one 'sent' row and one 'received' row that may carry
-- the same Circle id, and a unique index on the id alone would reject the
-- second one.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0011_webhook_idempotency.sql`.

create table if not exists public.tella_processed_notification (
  key text primary key,
  notification_id text not null,
  notification_type text not null,
  processed_at timestamptz not null default now()
);

-- The cleanup job prunes by age; Circle's retries are done within hours, so
-- a row is only useful for a few days.
create index if not exists tella_processed_notification_processed_at_idx
  on public.tella_processed_notification(processed_at);

alter table public.tella_processed_notification enable row level security;

-- Pre-existing duplicates would make the index below fail to build. Only
-- rows that already carry a circle_transaction_id are touched, keeping the
-- earliest of each group. Today that is outbound sends only; the duplicate
-- INBOUND rows this migration exists to prevent were written with a null
-- circle_transaction_id and are deliberately NOT deleted here — see the
-- README for the query to review them by hand. Deleting a user's money
-- records automatically, on a guess about which two are "the same", is not
-- something a migration should do unattended.
delete from public.tella_transactions t
  using public.tella_transactions keep
 where t.circle_transaction_id is not null
   and keep.circle_transaction_id = t.circle_transaction_id
   and keep.user_id = t.user_id
   and keep.direction = t.direction
   and (keep.created_at < t.created_at
        or (keep.created_at = t.created_at and keep.id < t.id));

create unique index if not exists tella_transactions_circle_transaction_id_idx
  on public.tella_transactions(user_id, direction, circle_transaction_id)
  where circle_transaction_id is not null;
