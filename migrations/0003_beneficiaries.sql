-- Saved beneficiaries: lets a user say "send 2000 to Chidi" instead of a
-- phone number or 0x address. Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0003_beneficiaries.sql`.

create table if not exists public.tella_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete cascade,
  label text not null,
  recipient_user_id uuid references public.tella_users(id) on delete set null,
  recipient_address text not null,
  recipient_whatsapp_number text,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per user, so "Chidi" and "chidi" can't both
-- be saved and collide when a user later types the name back.
create unique index if not exists tella_beneficiaries_user_id_label_idx
  on public.tella_beneficiaries(user_id, lower(label));

-- tella_pending_action.kind predates the migrations directory, so its
-- constraint definition (if any) isn't tracked here. The beneficiary-save
-- conversation now reuses that table with two new kind values
-- ('beneficiary_confirm', 'beneficiary_name') alongside the existing
-- 'send'. Defensively widen any existing check constraint so those inserts
-- don't get rejected — safe to run even if no such constraint exists.
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

alter table public.tella_pending_action
  add constraint tella_pending_action_kind_check
    check (kind in ('send', 'beneficiary_confirm', 'beneficiary_name'));
