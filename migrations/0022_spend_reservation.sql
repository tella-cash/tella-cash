-- Make the daily send cap hold under concurrency.
--
-- THE HOLE THIS CLOSES
--
-- checkSendLimits totalled tella_transactions rows to decide whether a send
-- fitted inside the rolling 24-hour cap. The row for a send was written by
-- sendReceiptAndFollowUp, which runs AFTER executePendingSend returns — so
-- between passing the check and appearing in it, a send was invisible.
--
-- Two confirm links tapped at the same moment therefore both read the same
-- pre-send total, both passed, and both transferred. The cap bounded a
-- SEQUENCE of sends and did nothing about a burst, which is the shape a
-- compromised account actually produces. Nothing bounded it: the balance
-- check has Circle behind it and would eventually refuse an overdraft, but
-- the daily cap is ours alone and had no backstop.
--
-- THE FIX, AND WHY IT IS SHAPED LIKE THIS
--
-- Exactly the pattern 0007 used for auth attempts, and for the same stated
-- reason: the check and the write happen inside one Postgres call, so a burst
-- of parallel callers cannot all read the same total and slip through
-- together. There the serialisation came free from an upsert's row lock;
-- there is no such row here — a send is an append — so this takes an advisory
-- lock on the user instead.
--
-- The lock is transaction-scoped and this function does nothing but arithmetic
-- and one insert, so it is held for microseconds. It is NEVER held across the
-- call to Circle: the reservation commits, then the transfer happens, then the
-- row is completed or removed. Holding a database lock across an external HTTP
-- call is how a single slow API turns into a stalled table.
--
-- THE LEDGER IS THE RESERVATION
--
-- No new table. The tella_transactions row that a send was always going to
-- produce is simply written BEFORE the transfer instead of after it, which is
-- what makes it visible to the next caller's check. Three consequences worth
-- being explicit about:
--
--   * A send that definitely FAILS has its row deleted — nothing moved, so
--     nothing should be counted or shown.
--   * A send whose outcome is UNKNOWN keeps its row. That is a change in
--     behaviour and a deliberate one: the old code recorded nothing at all for
--     an ambiguous transfer, so money that may well have left the wallet
--     consumed no allowance and never appeared in history. Counting it is the
--     conservative reading, and it matches what the user is told ("I can't
--     tell whether it went through").
--   * For about a second, a send in flight shows in history as Processing. It
--     is being processed. That is not a lie.
--
-- Apply BEFORE deploying the code that calls it — reserveSend fails closed on
-- a missing function, which would refuse every send. Same ordering requirement
-- as 0007, 0008, 0011 and 0013.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DATABASE_URL -f migrations/0022_spend_reservation.sql`.

create or replace function public.tella_reserve_daily_spend(
  p_user_id uuid,
  -- Text, not numeric. The amount is stored exactly as the user expressed it
  -- and is cast only for the comparison — a round trip through numeric would
  -- turn "12.50" into "12.5" in the history and on the receipt.
  p_amount_usdc text,
  p_amount_ngn text,
  -- Null means no cap. The caller resolves Infinity to null rather than
  -- passing an enormous number, so "unlimited" cannot be confused with a
  -- limit nobody meant to set.
  p_cap numeric,
  p_window interval,
  p_counterparty_label text,
  p_counterparty_address text,
  -- Set only by the hold-release job, for the hold it is about to execute:
  -- that row is still 'executing' while this runs, and counting it would make
  -- the transfer compete with itself. See lib/held_sends/repository.ts.
  p_exclude_held_send_id uuid default null
)
returns table (allowed boolean, transaction_id uuid, already numeric)
-- Deliberately NOT security definer, following 0020's reasoning: the only
-- caller is the service role, which can already write these tables, so definer
-- would add privilege without adding capability.
language plpgsql
set search_path = public
as $$
declare
  v_amount numeric := p_amount_usdc::numeric;
  v_sent numeric;
  v_held numeric;
  v_total numeric;
  v_id uuid;
begin
  -- Serialises every reservation for this one user. hashtextextended gives a
  -- stable 64-bit key from the uuid, and the lock releases with the enclosing
  -- transaction — microseconds from now, long before Circle is contacted.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select coalesce(sum(amount_usdc::numeric), 0)
    into v_sent
    from public.tella_transactions
   where user_id = p_user_id
     and direction = 'sent'
     and created_at >= now() - p_window;

  -- Queued transfers are committed money that has produced no transaction row
  -- yet, so they count too — the same reservation argument one step earlier.
  select coalesce(sum((payload ->> 'amount')::numeric), 0)
    into v_held
    from public.tella_held_send
   where user_id = p_user_id
     and state in ('holding', 'executing')
     and (p_exclude_held_send_id is null or id <> p_exclude_held_send_id);

  v_total := v_sent + v_held;

  if p_cap is not null and v_total + v_amount > p_cap then
    return query select false, null::uuid, v_total;
    return;
  end if;

  insert into public.tella_transactions (
    user_id, direction, amount_usdc, amount_ngn, token,
    counterparty_label, counterparty_address, status
  )
  values (
    p_user_id, 'sent', p_amount_usdc, p_amount_ngn, 'USDC',
    p_counterparty_label, p_counterparty_address, 'submitted'
  )
  returning id into v_id;

  return query select true, v_id, v_total;
end;
$$;

-- Sanity check after applying. The first call reserves and returns allowed=t;
-- the second, with a cap already consumed, returns allowed=f. Roll it back.
--
--   begin;
--     select * from tella_reserve_daily_spend(
--       '<some-user-uuid>', '5', '8000', 100, interval '24 hours', 'test', null);
--     select * from tella_reserve_daily_spend(
--       '<some-user-uuid>', '5', '8000', 1, interval '24 hours', 'test', null);
--   rollback;
