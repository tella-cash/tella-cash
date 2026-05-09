# Biometric (Face ID / Touch ID) — re-enable plan

PIN-only is the current confirmation path. WebAuthn was scaffolded then removed
to ship simpler. To bring biometric back as a Tier 1 path with PIN as fallback:

## 1. Reinstall packages

```bash
pnpm add @simplewebauthn/server @simplewebauthn/browser
```

## 2. Run SQL migrations

```sql
create table if not exists upay_webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references upay_user(id) on delete cascade,
  credential_id text unique not null,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[],
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists upay_webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references upay_user(id) on delete cascade,
  kind text not null check (kind in ('registration', 'authentication')),
  challenge text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists upay_webauthn_credentials_user_idx
  on upay_webauthn_credentials(user_id);

alter table upay_webauthn_credentials enable row level security;
alter table upay_webauthn_challenges enable row level security;
```

## 3. Add env vars to Vercel
WEBAUTHN_RP_ID=tella.cash
WEBAUTHN_ORIGIN=https://tella.cash
WEBAUTHN_RP_NAME=tella

`WEBAUTHN_RP_ID` MUST be the bare hostname (no protocol). Once any user
registers a credential, this value is locked in — changing it later
invalidates all credentials.

## 4. Re-add files

- `lib/webauthn/config.ts` — relying-party config reader
- `lib/webauthn/repository.ts` — credentials & challenges DB access
- `app/api/webauthn/register/options/route.ts`
- `app/api/webauthn/register/verify/route.ts`
- `app/api/webauthn/authenticate/options/route.ts`
- `app/api/webauthn/authenticate/verify/route.ts`

Each route uses `loadConfirmContext` to authenticate the user via the
confirm token, then runs the corresponding ceremony. Authenticate/verify
calls `executePendingSend` and `sendWhatsAppMessage` — same downstream
shape as the PIN verify route.

## 5. Re-add types

In `lib/supabase/types.ts`:

```typescript
export type WebAuthnChallengeKind = "registration" | "authentication";

export interface WebAuthnCredential {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: Uint8Array;
  counter: number;
  transports: string[] | null;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface WebAuthnChallenge {
  id: string;
  user_id: string;
  kind: WebAuthnChallengeKind;
  challenge: string;
  expires_at: string;
  created_at: string;
}
```

## 6. Add biometric branch to confirm-client.tsx

Add a feature-detection useEffect that calls
`PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`.
If true, route to a `ready_biometric` Stage. The PIN flow stays as
fallback when WebAuthn isn't available or the user prefers it.

## 7. Test on multiple WhatsApp WebView surfaces

- iOS WhatsApp in-app browser (should work)
- Android WhatsApp in-app browser (varies by version; older Android
  WebView ships without WebAuthn)
- Desktop WhatsApp Web (uses default browser; should work)

Have a "Use PIN instead" link visible at all times so users can opt out
if biometric fails or feels uncomfortable.