-- Analytics functions for the redesigned admin dashboard.
--
-- SAFE TO APPLY BEFORE OR AFTER THE CODE THAT USES IT. Everything here is new:
-- one small table and a set of `tella_analytics_*` functions. The six
-- `tella_admin_*` functions from 0020 are not touched, so a deployment that
-- still calls them keeps working. A deployment that calls these and does not
-- find them says "apply migration 0033" in place of the numbers.
--
-- WHY THE NUMBERS CHANGE FROM 0020
--
-- 0020 counted every `sent` row, settled or not, and had no way to say "this
-- week". Three things are different here, and each makes a figure smaller or
-- leaves it the same, never larger:
--
--   1. Settled only. A row still at `submitted` is in flight, abandoned, or a
--      send whose completion webhook was lost. None of those is a transfer
--      anyone should quote.
--   2. One transfer, counted once. A send from one tella user to another
--      writes TWO rows: `sent` for the sender and `received` for the
--      recipient. Adding sent and received together would count that money
--      twice. The recipient's row is recognised and kept out of volume (it is
--      still that person's activity, so they still count as an active wallet).
--   3. Duplicates removed. Inbound rows recorded twice before 0011 were left
--      in place then; they are collapsed here.
--
-- ONE DEFINITION, IN ONE PLACE
--
-- Every figure reads `tella_analytics_ledger()`. It is a function rather than
-- a view because a view in Supabase's public schema runs with its owner's
-- rights and is reachable with the anon key unless someone remembers
-- `security_invoker` and a revoke; a function that loses its revoke returns
-- nothing to anon, because row level security still applies.
--
-- `tella_analytics_ledger_audit()` is the same classification with the
-- rejected rows left in and a reason beside each, so "what did the dashboard
-- throw away" has an answer (see the checks at the bottom).
--
-- How an internal transfer is recognised: the two rows share a transaction
-- hash, OR the counterparty address is a wallet tella created. Either signal
-- is enough. The hash alone misses a sender row that never got its hash; the
-- address alone misses a wallet that was re-provisioned since. Using both
-- means a transfer is at worst put in the wrong class, not counted twice.
--
-- EVERY FUNCTION IS `stable`, SELECT-ONLY AND NOT SECURITY DEFINER, as in
-- 0020: the dashboard is read-only because of what these can do. Execute is
-- revoked from everyone but the service role, as in 0024 and 0028.
--
-- Times are bucketed in the zone passed in (the app passes Africa/Lagos), not
-- the database's.
--
-- Before applying, every row of this should say true:
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename like 'tella_%';
--
-- Apply via Supabase SQL editor or
-- `psql "$SUPABASE_DATABASE_URL" -f migrations/0033_admin_analytics_v2.sql`.
-- Re-runnable: it drops its own functions first.

begin;

-- Dropped by name, not by signature, so a re-run after a parameter list
-- changes cannot leave an old overload behind. PostgREST refuses to choose
-- between two functions with one name.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'tella\_analytics\_%'
  loop
    execute format('drop function %s', r.sig);
  end loop;
end $$;

-- Accounts that are not customers: a test account, a demo account. Their own
-- rows are left out of every figure, and a transfer to one of them is not
-- counted as volume.
--
-- Written by hand in the SQL editor, never by the app (see the bottom of this
-- file). A table rather than an env var so that marking an account takes one
-- statement and no redeploy.
create table if not exists public.tella_analytics_excluded_users (
  user_id uuid primary key references public.tella_users(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.tella_analytics_excluded_users enable row level security;

-- Every ledger row, classified, with the reason it is not counted if it isn't.
create function public.tella_analytics_ledger_audit()
returns table (
  tx_id uuid,
  user_id uuid,
  direction text,
  amount numeric,
  ts timestamptz,
  chain text,
  tx_hash text,
  flow text,
  counterparty_user_id uuid,
  paired boolean,
  reject text
)
language sql
stable
as $$
  with base as (
    select t.id, t.user_id, t.direction, t.status, t.token, t.created_at as ts,
           t.blockchain,
           -- CASE rather than a WHERE, so the cast can never be evaluated
           -- against a value the pattern has not passed.
           case when btrim(t.amount_usdc) ~ '^[0-9]+(\.[0-9]+)?$'
                then btrim(t.amount_usdc)::numeric end              as amount,
           lower(nullif(btrim(t.tx_hash), ''))                      as h,
           lower(nullif(btrim(t.counterparty_address), ''))         as cp,
           t.circle_transaction_id                                  as cid
      from public.tella_transactions t
  ),
  s1 as (
    select b.*,
           case when b.status <> 'complete'            then 'unsettled'
                when b.token is distinct from 'USDC'   then 'non_usdc'
                when b.amount is null or b.amount <= 0 then 'bad_amount'
           end as r1
      from base b
  ),
  -- One row per (user, direction, hash, amount). Circle's own transaction id
  -- is deliberately not part of the key: the duplicates this is for either
  -- have none or have two different ones.
  s2 as (
    select s.*,
           row_number() over (
             partition by (s.r1 is null), s.user_id, s.direction, s.h, s.amount
             order by (s.cid is null), s.ts, s.id
           ) as rn
      from s1 s
  ),
  ok as (
    select * from s2 x where x.r1 is null and (x.h is null or x.rn = 1)
  ),
  sent_by_hash as (
    select distinct on (o.h) o.h, o.user_id
      from ok o
     where o.direction = 'sent' and o.h is not null
     order by o.h, o.ts, o.id
  ),
  recv_by_hash as (
    select distinct on (o.h) o.h, o.user_id
      from ok o
     where o.direction = 'received' and o.h is not null
     order by o.h, o.ts, o.id
  ),
  addr as (
    select distinct on (x.a) x.a, x.user_id
      from (
        select lower(u.wallet_address) as a, u.id as user_id
          from public.tella_users u
         where u.wallet_address is not null
        union all
        select lower(w.address), w.user_id
          from public.tella_user_chain_wallets w
      ) x
     order by x.a, x.user_id
  ),
  c as (
    select s.*,
           a.user_id as addr_user,
           case s.direction when 'received' then sh.user_id else rh.user_id end as pair_user
      from s2 s
      left join sent_by_hash sh on s.direction = 'received' and sh.h = s.h
      left join recv_by_hash rh on s.direction = 'sent' and rh.h = s.h
      left join addr a on a.a = s.cp
  )
  select c.id,
         c.user_id,
         c.direction,
         c.amount,
         c.ts,
         coalesce(c.blockchain, 'ARC'),
         c.h,
         case when coalesce(c.pair_user, c.addr_user) = c.user_id then 'self'
              when c.direction = 'sent'
                   and coalesce(c.pair_user, c.addr_user) is not null then 'p2p'
              when c.direction = 'sent' then 'withdrawal'
              when coalesce(c.pair_user, c.addr_user) is not null then 'p2p_mirror'
              else 'deposit'
         end,
         coalesce(c.pair_user, c.addr_user),
         c.pair_user is not null,
         coalesce(
           c.r1,
           case when c.h is not null and c.rn > 1 then 'duplicate' end,
           case when exists (
                  select 1 from public.tella_analytics_excluded_users e
                   where e.user_id = c.user_id
                ) then 'excluded_user' end
         )
    from c;
$$;

-- The rows that count. `counts_volume` is false for the recipient's half of an
-- internal transfer, for a row with no transaction hash (it cannot be checked
-- for duplicates), and for a transfer to an excluded account. Those rows are
-- still activity: the person did use their wallet.
create function public.tella_analytics_ledger()
returns table (
  tx_id uuid,
  user_id uuid,
  direction text,
  amount numeric,
  ts timestamptz,
  chain text,
  flow text,
  counts_volume boolean
)
language sql
stable
as $$
  select a.tx_id, a.user_id, a.direction, a.amount, a.ts, a.chain, a.flow,
         a.flow in ('deposit', 'p2p', 'withdrawal')
           and a.tx_hash is not null
           and e.user_id is null
    from public.tella_analytics_ledger_audit() a
    left join public.tella_analytics_excluded_users e
      on e.user_id = a.counterparty_user_id
   where a.reject is null
     and a.flow <> 'self';
$$;

create function public.tella_analytics_user_firsts()
returns table (user_id uuid, first_ts timestamptz, sent_n bigint, recv_n bigint)
language sql
stable
as $$
  select l.user_id,
         min(l.ts),
         count(*) filter (where l.direction = 'sent'),
         count(*) filter (where l.direction = 'received')
    from public.tella_analytics_ledger() l
   group by l.user_id;
$$;

-- The headline figures for one window, [p_from, p_to). Null p_from is "since
-- the beginning"; null p_to is now.
--
-- Counts and unrounded sums only. Every ratio and every "is this sample big
-- enough to show a percentage" decision is made in lib/analytics/derive.ts,
-- where it is tested.
create function public.tella_analytics_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
as $$
  with bounds as (
    select coalesce(p_from, '-infinity'::timestamptz) as f,
           coalesce(p_to, now()) as t
  ),
  u as (
    select x.id, x.created_at, x.onboarding_step, x.wallet_status
      from public.tella_users x
     where not exists (
       select 1 from public.tella_analytics_excluded_users e where e.user_id = x.id
     )
  ),
  users as (
    select count(*) filter (where u.created_at < b.t)                          as total,
           count(*) filter (where u.created_at >= b.f and u.created_at < b.t)  as new_users,
           -- Onboarding and wallet state carry no timestamp, so these are
           -- "as things stand today, among people who had signed up by then".
           count(*) filter (where u.created_at < b.t
                              and u.onboarding_step = 'completed')             as onboarded,
           count(*) filter (where u.created_at < b.t
                              and u.wallet_status = 'active')                  as with_wallet,
           min(u.created_at)                                                   as first_at
      from bounds b
      left join u on true
  ),
  l as (select * from public.tella_analytics_ledger()),
  f as (select l.user_id, min(l.ts) as first_ts from l group by l.user_id),
  w as (
    select l.* from l cross join bounds b where l.ts >= b.f and l.ts < b.t
  ),
  per_user as (
    select w.user_id, bool_or(w.direction = 'sent') as sent
      from w
     group by w.user_id
  ),
  actives as (
    select count(p.user_id)                                    as total,
           count(p.user_id) filter (where p.sent)              as senders,
           count(p.user_id) filter (where not p.sent)          as receive_only,
           count(p.user_id) filter (where f.first_ts >= b.f)   as new_actives,
           count(p.user_id) filter (where f.first_ts < b.f)    as returning_actives
      from bounds b
      left join per_user p on true
      left join f on f.user_id = p.user_id
  ),
  vol as (
    select coalesce(sum(w.amount) filter (where w.counts_volume and w.flow = 'deposit'), 0)    as deposits,
           coalesce(sum(w.amount) filter (where w.counts_volume and w.flow = 'p2p'), 0)        as p2p,
           coalesce(sum(w.amount) filter (where w.counts_volume and w.flow = 'withdrawal'), 0) as withdrawals,
           coalesce(sum(w.amount) filter (where w.direction = 'sent'), 0)                      as raw_sent,
           coalesce(sum(w.amount) filter (where w.direction = 'received'), 0)                  as raw_received,
           count(*) filter (where w.counts_volume)                                             as n,
           count(*) filter (where w.counts_volume and w.flow = 'deposit')                      as n_deposits,
           count(*) filter (where w.counts_volume and w.flow = 'p2p')                          as n_p2p,
           count(*) filter (where w.counts_volume and w.flow = 'withdrawal')                   as n_withdrawals,
           avg(w.amount) filter (where w.counts_volume)                                        as avg_amount,
           percentile_cont(0.5) within group (order by w.amount)
             filter (where w.counts_volume)                                                    as median_amount
      from w
  )
  select jsonb_build_object(
    'version', 1,
    'users', jsonb_build_object(
      'total', users.total,
      'new', users.new_users,
      'onboarded', users.onboarded,
      'with_wallet', users.with_wallet
    ),
    'actives', jsonb_build_object(
      'total', actives.total,
      'senders', actives.senders,
      'receive_only', actives.receive_only,
      'new', actives.new_actives,
      'returning', actives.returning_actives
    ),
    'volume', jsonb_build_object(
      'deposits', vol.deposits,
      'p2p', vol.p2p,
      'withdrawals', vol.withdrawals,
      'total', vol.deposits + vol.p2p + vol.withdrawals,
      'net_flow', vol.deposits - vol.withdrawals,
      'raw_sent', vol.raw_sent,
      'raw_received', vol.raw_received
    ),
    'transfers', jsonb_build_object(
      'total', vol.n,
      'deposits', vol.n_deposits,
      'p2p', vol.n_p2p,
      'withdrawals', vol.n_withdrawals,
      'avg', vol.avg_amount,
      'median', vol.median_amount
    ),
    'meta', jsonb_build_object(
      'users_first_at', users.first_at,
      'ledger_first_at', (select min(l.ts) from l),
      'excluded_users', (select count(*) from public.tella_analytics_excluded_users)
    )
  )
  from users, actives, vol;
$$;

-- One row per calendar bucket in p_tz, oldest first, quiet buckets included
-- as zeros: a chart that drops empty days compresses time and makes a gap
-- look like activity.
--
-- p_grain is 'day', 'week', 'month', or 'auto'. Auto is for the all-time view:
-- weeks while there is under half a year of history, months after, from the
-- first bucket that has anything in it. Weeks start on Monday.
--
-- The last bucket is the one in progress (`is_partial`). It is drawn
-- differently and never compared with a full one.
create function public.tella_analytics_series(p_grain text, p_buckets integer, p_tz text)
returns table (
  grain text,
  bucket date,
  bucket_start timestamptz,
  bucket_end timestamptz,
  new_users bigint,
  cumulative_users bigint,
  active_wallets bigint,
  new_actives bigint,
  returning_actives bigint,
  transfers bigint,
  deposits numeric,
  p2p numeric,
  withdrawals numeric,
  is_partial boolean
)
language sql
stable
as $$
  with l as (select * from public.tella_analytics_ledger()),
  u as (
    select x.id, x.created_at
      from public.tella_users x
     where not exists (
       select 1 from public.tella_analytics_excluded_users e where e.user_id = x.id
     )
  ),
  origin as (
    select least((select min(u.created_at) from u), (select min(l.ts) from l)) as first_at
  ),
  pick as (
    select case when p_grain in ('day', 'week', 'month') then p_grain
                when o.first_at is null
                  or o.first_at > now() - interval '26 weeks' then 'week'
                else 'month'
           end as g,
           o.first_at
      from origin o
  ),
  cfg as (
    select p.g,
           case p.g when 'day' then interval '1 day'
                    when 'week' then interval '1 week'
                    else interval '1 month' end                              as step,
           date_trunc(p.g, now() at time zone p_tz)                          as cur,
           date_trunc(p.g, coalesce(p.first_at, now()) at time zone p_tz)    as first_bucket
      from pick p
  ),
  sized as (
    select c.*,
           least(60, greatest(
             case when p_buckets is null then 8 else 1 end,
             coalesce(
               p_buckets,
               case c.g
                 when 'day' then 30
                 when 'week' then
                   (extract(epoch from (c.cur - c.first_bucket)) / 604800)::integer + 1
                 else
                   (extract(year from age(c.cur, c.first_bucket)) * 12
                     + extract(month from age(c.cur, c.first_bucket)))::integer + 1
               end
             )
           )) as cnt
      from cfg c
  ),
  b as (
    select z.g,
           gs                               as local_start,
           gs at time zone p_tz             as s,
           (gs + z.step) at time zone p_tz  as e
      from sized z
     cross join lateral generate_series(z.cur - (z.cnt - 1) * z.step, z.cur, z.step) gs
  ),
  f as (select l.user_id, min(l.ts) as first_ts from l group by l.user_id),
  tx as (
    select b.local_start,
           count(distinct l.user_id)                                    as active,
           count(distinct l.user_id) filter (where f.first_ts >= b.s)   as new_actives,
           count(distinct l.user_id) filter (where f.first_ts < b.s)    as returning_actives,
           count(*) filter (where l.counts_volume)                      as transfers,
           coalesce(sum(l.amount) filter (where l.counts_volume and l.flow = 'deposit'), 0)    as deposits,
           coalesce(sum(l.amount) filter (where l.counts_volume and l.flow = 'p2p'), 0)        as p2p,
           coalesce(sum(l.amount) filter (where l.counts_volume and l.flow = 'withdrawal'), 0) as withdrawals
      from b
      join l on l.ts >= b.s and l.ts < b.e
      join f on f.user_id = l.user_id
     group by b.local_start
  ),
  -- Users are counted on their own, never in the same aggregate as ledger
  -- rows: a join would repeat each user once per transaction.
  us as (
    select b.local_start,
           (select count(*) from u where u.created_at >= b.s and u.created_at < b.e) as new_users,
           (select count(*) from u where u.created_at < b.e)                          as cumulative_users
      from b
  )
  select b.g,
         b.local_start::date,
         b.s,
         b.e,
         us.new_users,
         us.cumulative_users,
         coalesce(tx.active, 0),
         coalesce(tx.new_actives, 0),
         coalesce(tx.returning_actives, 0),
         coalesce(tx.transfers, 0),
         coalesce(tx.deposits, 0),
         coalesce(tx.p2p, 0),
         coalesce(tx.withdrawals, 0),
         b.e > now()
    from b
    join us on us.local_start = b.local_start
    left join tx on tx.local_start = b.local_start
   order by b.local_start;
$$;

-- Activation, for the people who signed up in [p_from, p_to).
--
-- STRICTLY NESTED: each stage requires every stage above it, so a bar can
-- never be longer than the one before. The price is that someone who sent
-- without a recorded receipt falls out at "received"; `sent_without_receiving`
-- says how many, so the leak is visible rather than silent.
create function public.tella_analytics_funnel(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
as $$
  with per as (
    select u.created_at,
           f.first_ts,
           u.onboarding_step = 'completed' as s2,
           u.wallet_status = 'active'      as s3,
           coalesce(f.recv_n, 0) > 0       as s4,
           coalesce(f.sent_n, 0) > 0       as s5,
           coalesce(f.sent_n, 0) > 1       as s6
      from public.tella_users u
      left join public.tella_analytics_user_firsts() f on f.user_id = u.id
     where u.created_at >= coalesce(p_from, '-infinity'::timestamptz)
       and u.created_at < coalesce(p_to, now())
       and not exists (
         select 1 from public.tella_analytics_excluded_users e where e.user_id = u.id
       )
  )
  select jsonb_build_object(
    'signed_up', count(*),
    'onboarded', count(*) filter (where s2),
    'wallet_active', count(*) filter (where s2 and s3),
    'received', count(*) filter (where s2 and s3 and s4),
    'sent', count(*) filter (where s2 and s3 and s4 and s5),
    'sent_repeat', count(*) filter (where s2 and s3 and s4 and s5 and s6),
    'any_sent', count(*) filter (where s5),
    'sent_without_receiving', count(*) filter (where s5 and not s4),
    'median_seconds_to_first_tx',
      percentile_cont(0.5) within group (
        order by extract(epoch from (first_ts - created_at))
      ) filter (where first_ts >= created_at),
    'first_tx_n', count(*) filter (where first_ts >= created_at)
  )
  from per;
$$;

-- Monthly retention. A cohort is everyone whose FIRST settled transfer fell in
-- that month; each cell is how many of them transacted in month +N. Offset 0
-- is the cohort itself. Months that have not happened yet are absent rather
-- than zero.
--
-- Cohorts are by first transfer, not by signup: an account row exists from
-- the first message, long before most people do anything, and "did the people
-- who used it come back" is the question retention is for.
create function public.tella_analytics_retention(p_months integer, p_tz text)
returns table (
  cohort_month date,
  cohort_size bigint,
  month_offset integer,
  active bigint,
  is_partial boolean
)
language sql
stable
as $$
  with l as (select * from public.tella_analytics_ledger()),
  um as (
    select distinct l.user_id, date_trunc('month', l.ts at time zone p_tz)::date as m
      from l
  ),
  co as (select um.user_id, min(um.m) as cohort from um group by um.user_id),
  cur as (select date_trunc('month', now() at time zone p_tz)::date as m),
  sizes as (select co.cohort, count(*) as n from co group by co.cohort),
  cells as (
    select s.cohort, s.n, o as off,
           (s.cohort + make_interval(months => o))::date as m
      from sizes s
     cross join cur
     cross join generate_series(0, greatest(p_months, 1) - 1) o
     where (s.cohort + make_interval(months => o))::date <= cur.m
       and s.cohort >= (cur.m - make_interval(months => greatest(p_months, 1) - 1))::date
  ),
  hits as (
    select co.cohort, um.m, count(*) as n
      from um
      join co on co.user_id = um.user_id
     group by co.cohort, um.m
  )
  select c.cohort,
         c.n,
         c.off,
         coalesce(h.n, 0),
         c.m = (select cur.m from cur)
    from cells c
    left join hits h on h.cohort = c.cohort and h.m = c.m
   order by c.cohort, c.off;
$$;

-- How often people transact. "Active" here means a settled transfer, sent or
-- received: there is no log of people opening a chat, so anything broader
-- would be a guess.
--
-- The 30-day figures cover the last 30 COMPLETE days in p_tz, so the average
-- daily figure and the monthly one are over exactly the same days.
create function public.tella_analytics_engagement(p_tz text)
returns jsonb
language sql
stable
as $$
  with l as (select * from public.tella_analytics_ledger()),
  cfg as (select date_trunc('day', now() at time zone p_tz) as today),
  days as (
    select g                                    as d,
           g at time zone p_tz                  as s,
           (g + interval '1 day') at time zone p_tz as e
      from cfg
     cross join lateral generate_series(
       cfg.today - interval '30 days', cfg.today - interval '1 day', interval '1 day'
     ) g
  ),
  daily as (
    select d.d, count(distinct l.user_id) as dau
      from days d
      left join l on l.ts >= d.s and l.ts < d.e
     group by d.d
  ),
  win as (
    select min(days.s) as s30,
           max(days.e) as e,
           (select days.s from days order by days.d desc offset 6 limit 1) as s7
      from days
  )
  select jsonb_build_object(
    'as_of_day', (select (cfg.today - interval '1 day')::date from cfg),
    'dau_yesterday', (select daily.dau from daily order by daily.d desc limit 1),
    'dau_today',
      (select count(distinct l.user_id) from l cross join cfg
        where l.ts >= cfg.today at time zone p_tz),
    'wau',
      (select count(distinct l.user_id) from l cross join win
        where l.ts >= win.s7 and l.ts < win.e),
    'mau',
      (select count(distinct l.user_id) from l cross join win
        where l.ts >= win.s30 and l.ts < win.e),
    'avg_dau_30d', (select avg(daily.dau) from daily),
    'days_with_activity', (select count(*) from daily where daily.dau > 0),
    'ledger_first_at', (select min(l.ts) from l)
  );
$$;

-- Where the volume comes from, for one window.
create function public.tella_analytics_distribution(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
as $$
  with bounds as (
    select coalesce(p_from, '-infinity'::timestamptz) as f,
           coalesce(p_to, now()) as t
  ),
  l as (select * from public.tella_analytics_ledger()),
  w as (
    select l.* from l cross join bounds b where l.ts >= b.f and l.ts < b.t
  ),
  -- Volume per wallet. An internal transfer sits with its sender only, so the
  -- wallets add up to the total.
  per as (
    select w.user_id,
           coalesce(sum(w.amount) filter (where w.counts_volume), 0) as vol
      from w
     group by w.user_id
  ),
  r as (
    select p.vol,
           row_number() over (order by p.vol desc, p.user_id) as rk,
           count(*) over () as n
      from per p
  ),
  conc as (
    select coalesce(max(r.n), 0)                                            as n,
           -- Never zero wallets in "the top tenth": with nine wallets it is one.
           coalesce(ceil(max(r.n) * 0.1)::integer, 0)                       as k,
           coalesce(sum(r.vol), 0)                                          as total,
           coalesce(sum(r.vol) filter (where r.rk <= ceil(r.n * 0.1)), 0)   as top_k,
           coalesce(max(r.vol), 0)                                          as top1
      from r
  ),
  edges as (select array[1, 5, 10, 25, 50, 100, 500]::numeric[] as e),
  hist as (
    select i,
           count(w.tx_id)             as n,
           coalesce(sum(w.amount), 0) as vol
      from generate_series(0, 7) i
      left join w
        on w.counts_volume
       and width_bucket(w.amount, (select edges.e from edges)) = i
     group by i
  ),
  u as (
    select x.id, x.created_at, x.whatsapp_channel
      from public.tella_users x
     cross join bounds b
     where x.created_at < b.t
       and not exists (
         select 1 from public.tella_analytics_excluded_users e where e.user_id = x.id
       )
  ),
  -- The channel someone arrived on is their EARLIEST channel row.
  -- tella_users.whatsapp_channel is overwritten when a user later messages on
  -- another channel, so it is only the fallback.
  first_channel as (
    select distinct on (c.user_id)
           c.user_id,
           case c.provider when 'twilio' then 'meta' else c.provider end as provider
      from public.tella_user_channel c
     order by c.user_id, c.created_at, c.id
  ),
  uc as (
    select u.id, u.created_at,
           coalesce(fc.provider,
                    case u.whatsapp_channel when 'twilio' then 'meta'
                                            else u.whatsapp_channel end,
                    'meta') as channel
      from u
      left join first_channel fc on fc.user_id = u.id
  ),
  act as (select distinct w.user_id from w),
  channels as (
    select uc.channel,
           count(*)                                        as users,
           count(*) filter (where uc.created_at >= b.f)    as new_users,
           count(a.user_id)                                as active_wallets
      from uc
     cross join bounds b
      left join act a on a.user_id = uc.id
     group by uc.channel
  ),
  -- Only a deposit can arrive on a chain other than Arc, so this is a split
  -- of deposits, not of all volume.
  networks as (
    select w.chain, count(*) as transfers, coalesce(sum(w.amount), 0) as volume
      from w
     where w.counts_volume and w.flow = 'deposit'
     group by w.chain
  )
  select jsonb_build_object(
    'concentration',
      (select jsonb_build_object(
         'n', conc.n, 'k', conc.k, 'total', conc.total,
         'top_k', conc.top_k, 'top1', conc.top1) from conc),
    'edges', (select to_jsonb(edges.e) from edges),
    'histogram',
      (select coalesce(jsonb_agg(
         jsonb_build_object('i', hist.i, 'count', hist.n, 'volume', hist.vol)
         order by hist.i), '[]'::jsonb) from hist),
    'channels',
      (select coalesce(jsonb_agg(
         jsonb_build_object('channel', channels.channel, 'users', channels.users,
                            'new_users', channels.new_users,
                            'active_wallets', channels.active_wallets)
         order by channels.users desc, channels.channel), '[]'::jsonb) from channels),
    'networks',
      (select coalesce(jsonb_agg(
         jsonb_build_object('chain', networks.chain, 'transfers', networks.transfers,
                            'volume', networks.volume)
         order by networks.volume desc, networks.chain), '[]'::jsonb) from networks)
  );
$$;

-- Things an operator should look at, and what the ledger left out.
--
-- `stuck_submitted` is sends still unsettled an hour on. Some of them did
-- settle and lost their completion webhook, so this is a list to reconcile,
-- not a count of failures.
create function public.tella_analytics_ops()
returns jsonb
language sql
stable
as $$
  with a as (select * from public.tella_analytics_ledger_audit()),
  stuck as (
    select count(*) as n, coalesce(sum(a.amount), 0) as amount, min(a.ts) as oldest
      from a
     where a.reject = 'unsettled'
       and a.direction = 'sent'
       and a.ts < now() - interval '1 hour'
  ),
  held as (
    select count(*) as n,
           coalesce(sum(
             case when btrim(h.payload->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
                  then btrim(h.payload->>'amount')::numeric end), 0) as amount,
           min(h.release_at) as next_release,
           count(*) filter (where h.release_at < now() - interval '10 minutes') as overdue
      from public.tella_held_send h
     where h.state = 'holding'
  ),
  rejects as (
    select a.reject, count(*) as n, coalesce(sum(a.amount), 0) as amount
      from a
     where a.reject is not null
     group by a.reject
  ),
  -- A receipt from a tella wallet with no settled send beside it. Kept out of
  -- volume, so the transfer is counted zero times, not twice.
  orphans as (
    select count(*) as n, coalesce(sum(a.amount), 0) as amount
      from a
     where a.reject is null and a.flow = 'p2p_mirror' and not a.paired
  ),
  nohash as (
    select count(*) as n, coalesce(sum(a.amount), 0) as amount
      from a
     where a.reject is null
       and a.tx_hash is null
       and a.flow in ('deposit', 'p2p', 'withdrawal')
  )
  select jsonb_build_object(
    'stuck_submitted',
      (select jsonb_build_object('count', stuck.n, 'amount', stuck.amount,
                                 'oldest_at', stuck.oldest) from stuck),
    'held',
      (select jsonb_build_object('count', held.n, 'amount', held.amount,
                                 'next_release_at', held.next_release,
                                 'overdue', held.overdue) from held),
    'held_unresolved',
      (select count(*) from public.tella_held_send h
        where h.state in ('executing', 'unknown')),
    'frozen',
      (select count(*) from public.tella_users u where u.frozen_at is not null),
    'excluded_users',
      (select count(*) from public.tella_analytics_excluded_users),
    'quality', jsonb_build_object(
      'rejected',
        (select coalesce(jsonb_object_agg(
           rejects.reject,
           jsonb_build_object('count', rejects.n, 'amount', rejects.amount)),
           '{}'::jsonb) from rejects),
      'orphan_internal_receipts',
        (select jsonb_build_object('count', orphans.n, 'amount', orphans.amount)
           from orphans),
      'no_hash',
        (select jsonb_build_object('count', nohash.n, 'amount', nohash.amount)
           from nohash)
    )
  );
$$;

-- Service role only. Invoker rights plus row level security already mean the
-- anon key gets zeros; this is the second lock, and it stops anyone spending
-- the database's time through the public API.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'tella\_analytics\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

commit;

-- So the API sees the new functions without waiting for its cache to expire.
notify pgrst, 'reload schema';

-- MARKING A TEST ACCOUNT (run once per account, after applying):
--
--   insert into public.tella_analytics_excluded_users (user_id, reason)
--   select id, 'test account' from public.tella_users
--    where whatsapp_number = '<the number, as stored>';
--
--   -- or by Telegram username:
--   insert into public.tella_analytics_excluded_users (user_id, reason)
--   select user_id, 'test account' from public.tella_user_channel
--    where provider = 'telegram' and lower(username) = lower('<username>');
--
--   -- undo:
--   delete from public.tella_analytics_excluded_users where user_id = '<uuid>';
--
-- Sanity checks after applying:
--
--   -- what the ledger leaves out, and why
--   select reject, count(*), sum(amount)
--     from public.tella_analytics_ledger_audit() group by 1;
--
--   -- the headline figures, all time
--   select jsonb_pretty(public.tella_analytics_summary(null, null));
--
--   -- must be false, then true
--   select has_function_privilege('anon',
--     'public.tella_analytics_summary(timestamptz, timestamptz)', 'execute'),
--          has_function_privilege('service_role',
--     'public.tella_analytics_summary(timestamptz, timestamptz)', 'execute');
