-- Enable row-level security on every tella table.
--
-- The app talks to Supabase exclusively through the service-role key
-- (lib/supabase/admin.ts), and service-role bypasses RLS — so this changes
-- nothing about how tella behaves today. That is the point. Right now the
-- only thing standing between a leaked anon key and every user's phone
-- number, wallet address, PIN hash and transaction history is the fact that
-- nobody has written a client-side query yet. With RLS off, the anon role
-- can read these tables; with RLS on and no policies, it can read nothing.
--
-- No policies are added deliberately. Adding a permissive one "so things
-- keep working" would undo the whole migration — nothing needs to work
-- differently, because nothing uses the anon role.
--
-- If a future feature does need direct client access, add a narrow policy
-- for that table alongside it, rather than loosening this file.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0009_enable_rls.sql`.

do $$
declare
  t text;
  -- tella_users and tella_pending_action predate the migrations directory,
  -- so they're matched by name rather than assumed present.
  tables text[] := array[
    'tella_users',
    'tella_pending_action',
    'tella_pending_send',
    'tella_transactions',
    'tella_beneficiaries',
    'tella_webauthn_credentials',
    'tella_webauthn_challenges',
    'tella_auth_attempts'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      raise notice 'RLS enabled on %', t;
    else
      raise notice 'skipped % (does not exist)', t;
    end if;
  end loop;
end
$$;

-- Not using FORCE ROW LEVEL SECURITY here. FORCE would extend RLS to the
-- table owner as well, which guards against a leaked owner-level connection
-- string — but it also depends on Supabase's service_role carrying the
-- BYPASSRLS attribute, and getting that wrong locks the application out of
-- its own database. The finding this migration answers is a leaked ANON key,
-- which ENABLE alone fully addresses. Revisit FORCE once it can be tested
-- against a staging project.
--
-- Sanity check after applying — every row should read rowsecurity = true:
--
--   select tablename, rowsecurity
--     from pg_tables
--    where schemaname = 'public' and tablename like 'tella_%';
