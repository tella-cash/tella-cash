-- Single-use tokens for the account-recovery flow.
--
-- Until now a user who forgot their PIN was locked out of their own money
-- permanently: pin/setup returns 409 once pin_hash is set, passkey
-- enrollment is refused once any factor exists (migration-era change in
-- app/api/confirm/webauthn/register/*), and nothing anywhere could clear
-- either. The only recovery was a manual database edit.
--
-- The token is the row id, same as tella_pending_send — a UUIDv4 carries
-- ~122 bits, which is enough to be unguessable in a link. It is delivered
-- over WhatsApp to the number already on file, so possession of that
-- WhatsApp account is the authenticating factor. That is exactly the trust
-- model the confirm links already run on, so this adds no new class of
-- attack surface; it does mean a compromised WhatsApp account can reset a
-- PIN, which is why the TTL is short, the token is single-use, and issuing
-- one is rate-limited through tella_auth_attempts (scope 'pin_reset').
--
-- Rows are kept after use rather than deleted: used_at plus created_at is
-- the audit trail for "when was this account's PIN last reset, and how
-- often has someone asked". The cleanup job prunes them past their window.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0010_security_tokens.sql`.

create table if not exists public.tella_security_token (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tella_users(id) on delete cascade,
  -- Room for future recovery kinds without another migration.
  kind text not null default 'pin_reset',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tella_security_token_kind_check
    check (kind in ('pin_reset'))
);

create index if not exists tella_security_token_user_id_created_at_idx
  on public.tella_security_token(user_id, created_at desc);

create index if not exists tella_security_token_expires_at_idx
  on public.tella_security_token(expires_at);

alter table public.tella_security_token enable row level security;
