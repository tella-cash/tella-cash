# Migrations

Apply in order against the project's Supabase database.

## How to apply

Open the Supabase SQL editor (or use `psql` against `SUPABASE_DB_URL`) and run the file's contents.

## Files

### `0001_biometric_confirm.sql`

Adds the schema for the in-browser biometric / PIN confirm flow:

- `pin_hash`, `pin_salt` columns on `tella_users` (PIN fallback when WebAuthn isn't available).
- `tella_webauthn_credentials` (one row per registered device).
- `tella_webauthn_challenges` (per-user challenge state for register / authenticate ceremonies).

After applying, set these env vars in `.env` (and on Vercel):

```
WEBAUTHN_RP_NAME=tella
WEBAUTHN_RP_ID=tella.example.com         # bare hostname, no protocol/port
WEBAUTHN_ORIGIN=https://tella.example.com # exact origin including protocol
APP_BASE_URL=https://tella.example.com    # used to build the confirm link in WhatsApp
```

> **Important:** WebAuthn credentials are bound to the `WEBAUTHN_RP_ID` value at registration time. Pin this to your final production hostname before any real users register, or every existing credential becomes useless when the domain changes.

### `0006_flow_pending_actions.sql`

Widens `tella_pending_action.kind`'s check constraint from `('send', 'beneficiary_confirm', 'beneficiary_name')` to `('send', 'flow')`. The local `classifyIntent()` classifier and the beneficiary-save state machine (`beneficiary_confirm`/`beneficiary_name`) were replaced by sendam-ai — an external HTTP service that decodes intents and, for multi-turn conversations, mints signed continuation tokens (`POST /flow/start`). `tella_pending_action` rows now just store `{ flow, token }` and forward the token back, never parsing it.

Apply before deploying any code that writes a `kind: 'flow'` row (a pre-migration deploy would hit the old check constraint and fail every insert).

After applying, set these env vars in `.env` (and on Vercel):

```
SENDAM_AI_BASE_URL=https://intent-decoder.onrender.com
SENDAM_AI_SIGNING_SECRET=<same value as sendam-ai's SERVICE_SIGNING_SECRET>
```
