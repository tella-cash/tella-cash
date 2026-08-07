-- Per-user attempt counter + lockout for the confirm-link auth paths.
--
-- A confirm link is a bearer token: whoever has the URL gets to the PIN
-- prompt. The PIN keyspace is 10^4, so without a throttle a leaked link is
-- a few thousand HTTP requests away from moving someone's money. scrypt in
-- lib/auth/pin.ts slows a single guess down, but not enough to matter at
-- that keyspace — the real control is here.
--
-- The increment-and-check has to be atomic. A read-then-write in the route
-- would let a parallel burst all read attempts=0 and every one of them pass
-- the check, which is exactly the shape of attack this is defending against.
-- Hence the RPC below rather than a select + update from the app.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0007_auth_attempts.sql`.

create table if not exists public.tella_auth_attempts (
  user_id uuid not null references public.tella_users(id) on delete cascade,
  -- 'pin_verify', 'webauthn_authenticate', later 'pin_reset'. Separate
  -- scopes so locking out the PIN path doesn't lock out passkeys.
  scope text not null,
  window_start timestamptz not null default now(),
  attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);

create index if not exists tella_auth_attempts_locked_until_idx
  on public.tella_auth_attempts(locked_until)
  where locked_until is not null;

-- Records one attempt and returns whether it is allowed to proceed.
--
-- Semantics:
--   * If a lockout is active, returns allowed=false without touching the
--     counter — a locked-out attacker can't extend or reset their own window.
--   * If the rolling window has elapsed, the counter restarts at this attempt.
--   * Otherwise increments; when the count reaches p_max the row is locked
--     for p_lockout and this attempt is refused.
--
-- Note the attempt is counted BEFORE the caller checks the PIN. That's
-- deliberate: a crash or timeout mid-verify must not hand back a free guess.
-- Callers reset the counter themselves on success.
create or replace function public.tella_record_auth_attempt(
  p_user_id uuid,
  p_scope text,
  p_max int,
  p_window interval,
  p_lockout interval
)
returns table (allowed boolean, attempts int, locked_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.tella_auth_attempts%rowtype;
begin
  insert into public.tella_auth_attempts as a (user_id, scope, window_start, attempts)
  values (p_user_id, p_scope, v_now, 0)
  on conflict (user_id, scope) do update
    -- No-op update purely to take a row lock and return the current row,
    -- serialising concurrent callers on this (user_id, scope).
    set updated_at = a.updated_at
  returning a.* into v_row;

  -- Active lockout: refuse without counting.
  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return query select false, v_row.attempts, v_row.locked_until;
    return;
  end if;

  -- Expired lockout or elapsed window: start a fresh window.
  if v_row.locked_until is not null or v_row.window_start + p_window <= v_now then
    v_row.window_start := v_now;
    v_row.attempts := 0;
    v_row.locked_until := null;
  end if;

  v_row.attempts := v_row.attempts + 1;

  if v_row.attempts >= p_max then
    v_row.locked_until := v_now + p_lockout;
  end if;

  update public.tella_auth_attempts
     set window_start = v_row.window_start,
         attempts = v_row.attempts,
         locked_until = v_row.locked_until,
         updated_at = v_now
   where user_id = p_user_id and scope = p_scope;

  -- The attempt that trips the limit is still allowed to be checked; the
  -- lockout applies from the next one. Otherwise a user who fatfingers the
  -- last permitted attempt correctly would be refused for no reason.
  return query select true, v_row.attempts, v_row.locked_until;
end;
$$;

-- Clears the counter after a successful authentication.
create or replace function public.tella_reset_auth_attempts(
  p_user_id uuid,
  p_scope text
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.tella_auth_attempts
   where user_id = p_user_id and scope = p_scope;
$$;
