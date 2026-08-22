-- Google as an identity anchor — apply BEFORE the code that uses it.
--
-- Everything else in this system is rooted in one phone number. Confirm
-- links, PIN resets, the freeze command, the panic code delivery — all of it
-- arrives over WhatsApp, which is precisely what is gone in the case these
-- controls exist for. Google is the first anchor that a SIM swap does not
-- take with it.
--
-- WHAT IT IS ALLOWED TO DO, AND WHAT IT IS NOT
--
-- Google ALONE can freeze. That is safe because freezing is the safe
-- direction: the worst an attacker achieves by freezing someone's account is
-- inconveniencing them, and the person who most needs that button has no
-- phone to prove anything else with.
--
-- Google ALONE can never unfreeze, and never moves money. Once Google is
-- accepted as a recovery factor, a compromised Google account would otherwise
-- become a compromised wallet — and Google's own account recovery is often
-- phone-based, so treating it as fully independent of the SIM is optimistic.
-- Unfreezing requires Google PLUS a factor that existed before the freeze.
--
-- That asymmetry — Google-only in, Google-plus-one out — is the entire
-- design, and it is the thing to preserve if this is ever refactored.
--
-- MATCH ON `sub`, NEVER ON EMAIL.
--
-- google_sub is the stable subject identifier. Email addresses get
-- reassigned, especially on Workspace domains where an employee leaves and
-- their address is later given to someone else. Matching on email is the
-- classic account-takeover bug in exactly this integration, and the unique
-- constraint below is on sub for that reason. google_email is stored for
-- display and for delivering alerts, and is never a lookup key.
--
-- Apply via Supabase SQL editor or
-- `psql $SUPABASE_DB_URL -f migrations/0018_google_identity.sql`.

create table if not exists public.tella_google_identity (
  user_id uuid primary key references public.tella_users(id) on delete cascade,

  -- The stable subject id from Google's ID token. The lookup key.
  google_sub text not null unique,

  -- Display and alert delivery only. Never used to find an account.
  google_email text not null,
  email_verified boolean not null default false,

  linked_at timestamptz not null default now(),
  last_verified_at timestamptz
);

create index if not exists tella_google_identity_email_idx
  on public.tella_google_identity(google_email);

alter table public.tella_google_identity enable row level security;

-- Two more token kinds:
--   'link_google' carries the pending link across the OAuth round trip
--   'unfreeze'    is minted after Google proves identity, and is spent only
--                 once a pre-existing factor is also satisfied
alter table public.tella_security_token
  drop constraint if exists tella_security_token_kind_check;

alter table public.tella_security_token
  add constraint tella_security_token_kind_check
  check (kind in ('pin_reset', 'link_telegram', 'link_google', 'unfreeze'));
