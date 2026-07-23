-- Replaces the beneficiary-conversation-specific kind values
-- ('beneficiary_confirm', 'beneficiary_name') with a single generic 'flow'
-- kind: the beneficiary-save conversation (and any future backend-initiated
-- multi-turn conversation) now runs entirely through sendam-ai's stateless
-- POST /flow/start + POST /decode {token} mechanism, instead of a local ad
-- hoc state machine. tella never parses the token — it just stores
-- { flow, token } as this row's payload and forwards the token back on the
-- user's next reply. See lib/sendam-ai/client.ts and
-- lib/agent/handler.ts's handleFlowPendingResponse.
--
-- 'send' is kept in the constraint for backward compatibility with any
-- pre-0005 unexpired rows, but a repo-wide grep found no current code path
-- that creates or queries a kind='send' row — it appears fully vestigial
-- (see 0005_pending_sends.sql's own note that such rows predate the
-- dedicated tella_pending_send table and are left to expire naturally).
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0006_flow_pending_actions.sql`.

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

-- Delete any leftover 'beneficiary_confirm'/'beneficiary_name' rows before
-- re-adding the constraint. Postgres validates a new CHECK against EVERY
-- existing row regardless of expires_at (which is only an app-level read
-- filter — nothing actually deletes expired rows), so a stale row with an
-- old kind value makes the ADD CONSTRAINT below fail with
-- "check constraint ... is violated by some row". These rows are ephemeral
-- multi-turn conversation state (short TTL, nothing reads these kinds
-- anymore), so dropping them is safe: any user mid-flow timed out long ago
-- and the next message just re-decodes from scratch.
delete from public.tella_pending_action
where kind not in ('send', 'flow');

alter table public.tella_pending_action
  add constraint tella_pending_action_kind_check
    check (kind in ('send', 'flow'));
