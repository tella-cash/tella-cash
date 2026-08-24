-- Adds a 'confirm' kind to tella_pending_action, so that a destructive
-- action can be proposed in one message and carried out in the next.
--
-- The first and only user of it is the account freeze.
--
-- WHAT THIS DELIBERATELY GIVES UP
--
-- 0012_account_freeze.sql argues that freezing should require no factor and
-- no confirmation, because someone whose phone has just been taken has
-- seconds, and an attacker who freezes an account has achieved nothing an
-- attacker wants. That argument is still correct about the DIRECTION of the
-- risk. What it underweighted is how loose detect-freeze-request.ts has to
-- be to catch "someone took my phone" — loose enough that it also catches
-- people who are describing a problem rather than asking for the kill
-- switch. Every one of those false positives costs an unfreeze, which needs
-- a factor that predates the freeze, which is precisely the thing most of
-- these accounts do not have.
--
-- So the trade is made explicitly: a freeze now costs two messages. If the
-- phone is taken between them, nothing freezes. That is the real price, it
-- is not hypothetical, and it is the reason the confirmation copy says
-- "nothing has changed yet" in so many words.
--
-- NOT AFFECTED, and this is deliberate rather than an oversight:
--
--   * the panic code (/api/panic) — a pre-registered secret typed on
--     purpose IS the confirmation, and it exists for the case where there
--     is no time for a second message.
--   * the Google web freeze button (/security/freeze) — a button on a page
--     the user navigated to is already a deliberate act.
--
-- Anyone tempted to "make this consistent" later should add the
-- confirmation to neither of those.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0021_confirm_pending_action.sql`.

-- Same drop-then-re-add shape as 0006, and for the same reason: the
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
-- expired rows), so a stale row with a retired kind would make the ADD
-- below fail with "check constraint ... is violated by some row".
delete from public.tella_pending_action
where kind not in ('send', 'flow', 'confirm');

alter table public.tella_pending_action
  add constraint tella_pending_action_kind_check
    check (kind in ('send', 'flow', 'confirm'));
