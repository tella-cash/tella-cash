-- Adds a 'save_beneficiary' kind to tella_pending_action, so the "want to
-- save this recipient?" question can be asked and answered without sendam-ai.
--
-- WHY THIS EXISTS
--
-- The beneficiary offer was a 'flow' row: the recipient lived inside an
-- opaque sendam-ai continuation token, and reading the user's yes/no meant
-- POSTing it back to /decode. Both halves of a courtesy question were network
-- calls to a service that has nothing to do with the answer.
--
-- The minting half was the one that actually broke. sendReceiptAndFollowUp
-- called /flow/start BEFORE sending the question, with the mint, the row
-- write and the message all inside a single try/catch whose only action was a
-- console.error. So any of these meant the user was never asked at all:
--
--   * /flow/start timing out (3s budget);
--   * the circuit breaker in lib/sendam-ai/client.ts being open — and it was
--     shared with /decode, which runs on EVERY inbound message, so four
--     consecutive decoder failures silently swallowed every beneficiary offer
--     for the next thirty seconds;
--   * SENDAM_AI_BASE_URL or SENDAM_AI_SIGNING_SECRET being unset.
--
-- And there was no second chance: by the time this runs the send is complete
-- and its pending row is gone, so nothing ever re-offers.
--
-- This kind stores the recipient in the clear instead, and lib/agent/
-- beneficiary-flow.ts reads the reply with anchored patterns — the same
-- decision, for the same reason, that 0021 records for the freeze
-- confirmation and that SendFlowPendingPayload records for the guided send.
-- The 'flow' kind stays exactly as it is; the faucet still uses it.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0023_beneficiary_pending_action.sql`.

-- Same drop-then-re-add shape as 0006 and 0021, and for the same reason: the
-- constraint has been renamed at least once (it predates this directory), so
-- dropping it by name alone is not reliable.
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.tella_pending_action'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.tella_pending_action drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.tella_pending_action
  drop constraint if exists tella_pending_action_kind_check;

-- Postgres validates a new CHECK against EVERY existing row regardless of
-- expires_at (which is only an app-level read filter — nothing deletes
-- expired rows), so a stale row with a retired kind would make the ADD below
-- fail with "check constraint ... is violated by some row".
delete from public.tella_pending_action
where kind not in ('send', 'flow', 'confirm', 'save_beneficiary');

alter table public.tella_pending_action
  add constraint tella_pending_action_kind_check
    check (kind in ('send', 'flow', 'confirm', 'save_beneficiary'));

-- Any 'flow' row still holding a save_beneficiary token is now unanswerable:
-- nothing dispatches it to the token path any more. These are ephemeral
-- (15-minute TTL) and the worst case for a user mid-answer is that their next
-- message is handled normally instead of being read as a beneficiary name.
delete from public.tella_pending_action
where kind = 'flow'
  and payload ->> 'flow' = 'save_beneficiary';
