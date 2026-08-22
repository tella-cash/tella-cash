-- Read-only aggregate functions for the admin dashboard.
--
-- These are SQL functions rather than queries assembled in TypeScript, for
-- one reason: PostgREST cannot express a GROUP BY, a date_trunc or a
-- correlated subquery through its filter syntax, so the alternative was
-- either pulling whole tables into the app and aggregating in JavaScript, or
-- shipping raw SQL strings from the server. The first sends every user's
-- phone number over the wire to count them; the second is a habit worth not
-- starting in a repository that moves money.
--
-- EVERY FUNCTION IS `stable` AND CONTAINS ONLY SELECT. That is the point: the
-- dashboard's read-only-ness is enforced by what these can do, not by anyone
-- remembering. `stable` also lets Postgres reject a write if one is ever
-- added by mistake.
--
-- Deliberately NOT security definer. They run as the caller, which is the
-- service role, which could already read these tables — so definer would add
-- privilege without adding capability, and privilege that buys nothing is
-- privilege to regret.
--
-- Every figure is denominated in testnet USDC. The whole application runs on
-- ARC-TESTNET, so the behaviour is real and the money is not; the dashboard
-- labels it rather than leaving a reader to assume.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0020_admin_analytics.sql`.

create or replace function public.tella_admin_user_counts()
returns table (
  total bigint,
  onboarded bigint,
  with_wallet bigint,
  new_7d bigint,
  ever_received bigint
)
language sql
stable
as $$
  select
    count(*),
    count(*) filter (where onboarding_step = 'completed'),
    count(*) filter (where wallet_status = 'active'),
    count(*) filter (where created_at > now() - interval '7 days'),
    (select count(distinct user_id)
       from public.tella_transactions where direction = 'received')
  from public.tella_users;
$$;

create or replace function public.tella_admin_transaction_totals()
returns table (tx_count bigint, volume_usdc numeric)
language sql
stable
as $$
  -- Sends only. Counting both directions would double-count every
  -- tella-to-tella transfer, which is most of them, and inflate the one
  -- number an outsider is most likely to quote.
  select count(*), coalesce(round(sum(amount_usdc::numeric), 2), 0)
    from public.tella_transactions
   where direction = 'sent';
$$;

create or replace function public.tella_admin_sender_counts()
returns table (senders bigint, repeat_senders bigint)
language sql
stable
as $$
  with per_user as (
    select user_id, count(*) as n
      from public.tella_transactions
     where direction = 'sent'
     group by user_id
  )
  select count(*), count(*) filter (where n > 1) from per_user;
$$;

create or replace function public.tella_admin_channel_mix()
returns table (provider text, users bigint)
language sql
stable
as $$
  select provider, count(distinct user_id)
    from public.tella_user_channel
   where verified_at is not null
   group by provider
   order by 2 desc;
$$;

create or replace function public.tella_admin_security_posture()
returns table (
  with_pin bigint,
  with_passkey bigint,
  with_google bigint,
  with_panic_code bigint,
  no_factor bigint,
  frozen bigint
)
language sql
stable
as $$
  select
    count(*) filter (where u.pin_hash is not null),
    (select count(distinct user_id) from public.tella_webauthn_credentials),
    (select count(*) from public.tella_google_identity),
    count(*) filter (where u.panic_code_hash is not null),
    -- The number that matters most: every recovery rule is "prove yourself
    -- with a factor you enrolled earlier", and it protects nobody here.
    count(*) filter (
      where u.pin_hash is null
        and not exists (
          select 1 from public.tella_webauthn_credentials w where w.user_id = u.id
        )
    ),
    count(*) filter (where u.frozen_at is not null)
  from public.tella_users u;
$$;

create or replace function public.tella_admin_daily_activity()
returns table (
  day date,
  received bigint,
  sent bigint,
  received_usdc numeric,
  sent_usdc numeric
)
language sql
stable
as $$
  -- generate_series so quiet days appear as zero rather than vanishing. A
  -- bar chart that silently drops empty days compresses time and makes a
  -- gap look like activity.
  select
    d::date,
    coalesce(count(t.id) filter (where t.direction = 'received'), 0),
    coalesce(count(t.id) filter (where t.direction = 'sent'), 0),
    coalesce(round(sum(t.amount_usdc::numeric)
      filter (where t.direction = 'received'), 2), 0),
    coalesce(round(sum(t.amount_usdc::numeric)
      filter (where t.direction = 'sent'), 2), 0)
  from generate_series(
         (current_date - interval '29 days')::date, current_date, interval '1 day'
       ) as d
  left join public.tella_transactions t
    on t.created_at >= d and t.created_at < d + interval '1 day'
  group by d
  order by d;
$$;

-- Sanity check after applying:
--
--   select * from tella_admin_user_counts();
--   select * from tella_admin_daily_activity() order by day desc limit 5;
