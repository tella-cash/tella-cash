-- Delayed execution for large sends — apply BEFORE deploying the code.
--
-- Above a threshold, a send is authorized immediately and executed a day
-- later. The gap is the whole feature: it is the window in which a user who
-- did not make that send finds out about it and freezes the account. Every
-- control before this one bounds a single transfer; this one bounds how fast
-- an attacker who has satisfied those controls can convert access into money.
--
-- WHY NOT JUST EXTEND tella_pending_send
--
-- Three reasons, any one of which is sufficient.
--
--   1. Its 5-minute TTL is a security property, not a convenience. The row id
--      IS the confirm-link token — a bearer URL sitting in a WhatsApp thread
--      that authorizes a transfer to anyone who opens it. Holding that open
--      for 24 hours makes it 288 times more exposed.
--   2. listActivePendingSends, cancelMostRecentPendingSend and
--      remindOtherPendingSends all assume these rows are short-lived
--      nuisances. A day-old row would pollute "cancel" and every post-send
--      reminder with something that is not actually awaiting confirmation.
--   3. The cleanup cron deletes unclaimed rows past expires_at, so a held
--      send would be swept away about five minutes in.
--
-- THE MODEL: AUTHORIZED, THEN EMBARGOED
--
-- A held send is NOT an unconfirmed send. The user proves their factor on the
-- normal 5-minute confirm link exactly as they do today; only EXECUTION is
-- delayed. That separation is what makes this safe to auto-execute later: the
-- authorization already happened, in person, with a factor.
--
-- It also introduces the first actor in this system that moves money without
-- a user gesture. Until now every transfer traced back to someone tapping
-- something. The release job therefore re-checks everything at release time
-- rather than trusting a day-old decision — limits, balance, and above all
-- the freeze, since a freeze that did not cancel holds would be no freeze at
-- all.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0015_held_sends.sql`.

create table if not exists public.tella_held_send (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete cascade,

  -- Same SendPayload shape as tella_pending_send, carried over verbatim at
  -- authorization time. The amount is fixed then and never recomputed.
  payload jsonb not null,

  authorized_at timestamptz not null default now(),
  release_at timestamptz not null,

  state text not null default 'holding'
    check (state in ('holding', 'executing', 'sent', 'failed', 'unknown', 'cancelled')),

  cancelled_at timestamptz,
  cancelled_by text,

  -- Circle's transaction id once submitted, so a released hold can be tied
  -- back to its transfer the same way an outbound send can.
  circle_transaction_id text,

  created_at timestamptz not null default now()
);

-- The release job's only query: due rows still holding. Partial so it stays
-- small however much history accumulates.
create index if not exists tella_held_send_due_idx
  on public.tella_held_send(release_at)
  where state = 'holding';

-- Reserved-amount accounting reads every non-terminal row for one user.
create index if not exists tella_held_send_user_state_idx
  on public.tella_held_send(user_id, state);

alter table public.tella_held_send enable row level security;

-- Sanity checks after applying:
--
--   -- what is queued
--   select id, user_id, payload->>'amount' as amount, release_at
--     from public.tella_held_send where state = 'holding'
--    order by release_at;
--
--   -- anything stuck mid-execution (should be empty; a row here means the
--   -- release job died between claiming and recording an outcome, and needs
--   -- reconciling against Circle exactly like a pending_send with
--   -- outcome = 'unknown')
--   select * from public.tella_held_send where state = 'executing';
