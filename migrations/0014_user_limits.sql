-- Per-user spend limits — apply BEFORE deploying the code that uses it.
--
-- Both caps are currently process env vars: TELLA_MAX_SEND_USDC and
-- TELLA_DAILY_SEND_LIMIT_USDC, identical for all 64 users. That was the right
-- first move — lib/sends/limits.ts says in its own header that the point of
-- putting them in env was to allow tightening during an incident without a
-- deploy — but it means a cautious user cannot set their own ceiling lower,
-- and a compromised account is bounded only by whatever suits everyone else.
--
-- WHY A SEPARATE TABLE RATHER THAN COLUMNS ON tella_users
--
-- Because NULL has to mean "use the current default", not "zero" and not "a
-- value copied from the default at the time the row was written". Columns on
-- tella_users would work, but the moment a default is backfilled into 64 rows
-- the env var stops being the global lever it was added to be: tightening it
-- during an incident would no longer affect anyone. Keeping overrides sparse
-- and separate preserves both behaviours — per-user ceilings AND one knob
-- that still moves everybody who has not set their own.
--
-- Most users will never have a row here. That is the intended shape.
--
-- The columns for tiers that do not exist yet (step_up_threshold_usdc,
-- hold_threshold_usdc) are deliberately included now. They cost nothing
-- empty, and adding them later would mean a second migration against a table
-- whose whole purpose is to be read on the money path.
--
-- numeric, not text. tella_transactions stores amounts as text for historical
-- reasons and the code parseFloats them back; a limit is a number that gets
-- compared, never displayed verbatim, so there is no reason to repeat that.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0014_user_limits.sql`.

create table if not exists public.tella_user_limits (
  user_id uuid primary key references public.tella_users(id) on delete cascade,

  -- NULL on every column means "fall back to the env default". A row may
  -- exist with only one column set.
  per_tx_cap_usdc numeric,
  daily_cap_usdc numeric,

  -- Reserved for the step-up and hold tiers. Unused today.
  step_up_threshold_usdc numeric,
  hold_threshold_usdc numeric,

  updated_at timestamptz not null default now(),

  -- A limit of zero would silently disable sending, which is what the freeze
  -- is for and should not be reachable by fat-fingering a settings form.
  constraint tella_user_limits_positive check (
    (per_tx_cap_usdc is null or per_tx_cap_usdc > 0) and
    (daily_cap_usdc is null or daily_cap_usdc > 0) and
    (step_up_threshold_usdc is null or step_up_threshold_usdc > 0) and
    (hold_threshold_usdc is null or hold_threshold_usdc > 0)
  )
);

alter table public.tella_user_limits enable row level security;

-- Sanity check after applying — should be empty, since every user starts on
-- the env defaults:
--
--   select * from public.tella_user_limits;
