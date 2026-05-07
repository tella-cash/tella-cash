-- Adds biometric (WebAuthn) + PIN confirmation for outbound sends.
-- Apply via Supabase SQL editor or `psql $SUPABASE_DB_URL -f migrations/0001_biometric_confirm.sql`.

-- 1. PIN fallback columns on users. Set lazily the first time a user
--    confirms a send on a device without WebAuthn support.
alter table public.upay_users
  add column if not exists pin_hash text,
  add column if not exists pin_salt text;

-- 2. WebAuthn credentials. One row per (user, device).
create table if not exists public.upay_webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.upay_users(id) on delete cascade,
  credential_id text not null unique,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[],
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists upay_webauthn_credentials_user_id_idx
  on public.upay_webauthn_credentials(user_id);

-- 3. Per-user, per-ceremony WebAuthn challenge state. Vercel Functions
--    are stateless across invocations, so we persist the challenge
--    instead of holding it in memory between options/verify calls.
create table if not exists public.upay_webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.upay_users(id) on delete cascade,
  kind text not null check (kind in ('registration', 'authentication')),
  challenge text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists upay_webauthn_challenges_user_id_kind_idx
  on public.upay_webauthn_challenges(user_id, kind);

-- 4. Periodic cleanup hint: expired challenges and rows older than a day
--    can be hard-deleted by a cron / SQL job.
--    delete from public.upay_webauthn_challenges where expires_at < now();
