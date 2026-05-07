# Migrations

Apply in order against the project's Supabase database.

## How to apply

Open the Supabase SQL editor (or use `psql` against `SUPABASE_DB_URL`) and run the file's contents.

## Files

### `0001_biometric_confirm.sql`

Adds the schema for the in-browser biometric / PIN confirm flow:

- `pin_hash`, `pin_salt` columns on `upay_users` (PIN fallback when WebAuthn isn't available).
- `upay_webauthn_credentials` (one row per registered device).
- `upay_webauthn_challenges` (per-user challenge state for register / authenticate ceremonies).

After applying, set these env vars in `.env` (and on Vercel):

```
WEBAUTHN_RP_NAME=UPay
WEBAUTHN_RP_ID=upay.example.com         # bare hostname, no protocol/port
WEBAUTHN_ORIGIN=https://upay.example.com # exact origin including protocol
APP_BASE_URL=https://upay.example.com    # used to build the confirm link in WhatsApp
```

> **Important:** WebAuthn credentials are bound to the `WEBAUTHN_RP_ID` value at registration time. Pin this to your final production hostname before any real users register, or every existing credential becomes useless when the domain changes.
