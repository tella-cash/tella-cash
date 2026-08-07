-- Claim-then-execute for pending sends.
--
-- executePendingSend used to DELETE the pending row before calling Circle.
-- That gave single-use semantics (only one confirm wins the delete), but it
-- destroyed the record of what was being attempted right before the risky
-- part. When the Circle call then timed out, there was nothing left to
-- reconcile against, and the user was told:
--
--   "I couldn't complete that transfer. Your balance is unchanged."
--
-- which is a claim about their money that the code had no way to know was
-- true. A submitted-but-unacknowledged transfer produces exactly that path.
--
-- Claiming instead of deleting keeps the same single-use guarantee — the
-- conditional UPDATE is atomic, so only one confirm can flip a null
-- claimed_at — while leaving the row in place through the transfer, so an
-- ambiguous outcome is still visible afterwards.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0008_pending_send_claim.sql`.

alter table public.tella_pending_send
  add column if not exists claimed_at timestamptz;

-- Set when the transfer is handed to Circle and we haven't yet heard back.
-- Rows in this state are the ones worth looking at after an incident.
alter table public.tella_pending_send
  add column if not exists outcome text;

alter table public.tella_pending_send
  drop constraint if exists tella_pending_send_outcome_check;

alter table public.tella_pending_send
  add constraint tella_pending_send_outcome_check
  check (outcome is null or outcome in ('sent', 'failed', 'unknown'));

-- Finds claimed rows that never reached a terminal outcome.
create index if not exists tella_pending_send_unresolved_idx
  on public.tella_pending_send(claimed_at)
  where claimed_at is not null and outcome is null;
