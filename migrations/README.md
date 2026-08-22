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

The migration deletes any leftover `beneficiary_confirm`/`beneficiary_name` rows before re-adding the constraint — Postgres validates a new CHECK against every existing row, and nothing actually purges expired rows (`expires_at` is only an app-level read filter), so a stale row would otherwise make the migration fail with `check constraint ... is violated by some row`. Those rows are ephemeral, past-TTL conversation state and safe to drop.

After applying, set these env vars in `.env` (and on Vercel):

```
SENDAM_AI_BASE_URL=https://intent-decoder.onrender.com
SENDAM_AI_SIGNING_SECRET=<same value as sendam-ai's SERVICE_SIGNING_SECRET>
```

### `0007_auth_attempts.sql` — apply BEFORE the code that uses it

Per-user attempt counter and lockout (`tella_auth_attempts`) plus the atomic
`tella_record_auth_attempt` / `tella_reset_auth_attempts` functions, backing
`lib/auth/rate-limit.ts`.

> **Order matters.** The limiter fails closed: with the table absent, every
> PIN confirmation is refused. Apply this before deploying.

### `0008_pending_send_claim.sql` — apply BEFORE the code that uses it

Adds `claimed_at` and `outcome` to `tella_pending_send`, so a confirmed send
is claimed rather than deleted before the transfer. Without these columns
`claimPendingSend` errors and no send completes.

Rows left with `claimed_at set, outcome = 'unknown'` are transfers whose fate
is genuinely unknown — reconcile them against Circle by hand:

```sql
select id, user_id, payload->>'amount' as amount, claimed_at
  from tella_pending_send
 where claimed_at is not null and outcome is null or outcome = 'unknown';
```

### `0009_enable_rls.sql`

Enables row-level security on every `tella_*` table, with no policies. The
app uses only the service-role key (which bypasses RLS), so this is a no-op
for behaviour — it closes the gap where a leaked **anon** key could read
every user's phone number, wallet address and PIN hash.

Verify afterwards that the app can still read and write. `FORCE ROW LEVEL
SECURITY` is deliberately not used; see the comment in the file.

### `0010_security_tokens.sql`

`tella_security_token` — single-use, 10-minute recovery tokens for the
WhatsApp-initiated PIN reset (`/security/[token]`). Without it the recovery
page 500s and locked-out users stay locked out.

### `0011_webhook_idempotency.sql` — apply BEFORE the code that uses it

`tella_processed_notification` (once-only claim for Circle webhook
deliveries) plus a unique index on
`tella_transactions(user_id, direction, circle_transaction_id)`.

Circle's webhooks are at-least-once. Before this, every redelivery of a
`transactions.inbound` COMPLETE re-ran the whole handler — a second
"💰 Received" WhatsApp message and a second `tella_transactions` row for one
transfer, so 10 USDC received read as 20 in "history".

> **Order matters.** `claimNotification` fails closed: with the table absent
> every notification throws and no inbound or outbound message is delivered.

The migration deletes pre-existing duplicate rows that already carry a
`circle_transaction_id` (outbound sends only) so the unique index can build.
Duplicate **inbound** rows — the ones this fixes — were written with a null
`circle_transaction_id` and are left alone; deleting money records on a guess
isn't a migration's call. Review them by hand:

```sql
select user_id, tx_hash, amount_usdc, count(*), min(created_at), max(created_at)
  from tella_transactions
 where direction = 'received' and tx_hash is not null
 group by 1, 2, 3
having count(*) > 1;
```

Each group is one on-chain transfer recorded more than once — unless the
sender genuinely batched two identical transfers to the same wallet in one
transaction, which the tx hash alone can't distinguish. Check the hash on the
explorer before deleting the extras.

### `0012_account_freeze.sql` — apply BEFORE the code that uses it

`frozen_at` / `frozen_reason` / `frozen_source` / `panic_code_hash` on
`tella_users`, backing the account freeze (`lib/users/freeze.ts`) and the
panic code (`lib/security/panic-code.ts`).

Deliberately **not** a new `wallet_status` value. `listUsersNeedingWallet`
selects on that column, so a `'frozen'` value would have the `retry-wallets`
cron treat a frozen account as failed provisioning, and `setWalletActive`
would then silently thaw it on a successful retry.

With the columns absent the freeze fails loudly at the moment it is needed
(the update errors and the user is told it did not work), which is the right
failure but not one you want a real user to meet.

Freeze is reachable from chat (`freeze`, `my phone was stolen`) and from
`/panic` with a phone number and panic code. Unfreeze is operator-assisted
for now, on purpose — until a factor exists that WhatsApp possession does not
grant, an unfreeze link over WhatsApp would let an attacker holding the phone
undo it in one tap:

```sql
update public.tella_users
   set frozen_at = null, frozen_reason = null, frozen_source = null
 where id = '<user id>';
```

### Environment added alongside 0007–0012

```
CRON_SECRET=<random string>            # required by /api/cron/*; they refuse to run without it
ALERT_WEBHOOK_URL=                     # optional: Slack/Discord webhook for security events
TELLA_MAX_SEND_USDC=100                # optional, per-transfer cap
TELLA_DAILY_SEND_LIMIT_USDC=500        # optional, rolling 24h cap
TELLA_AUTH_MAX_ATTEMPTS=5              # optional
TELLA_AUTH_WINDOW_SECONDS=900          # optional
TELLA_AUTH_LOCKOUT_SECONDS=900         # optional
```

`APP_BASE_URL` is now **required** — it no longer falls back to
`http://localhost:3000`. That fallback silently bound passkeys to rpID
`localhost`, which registers fine and then never authenticates.

See `.env.example` for the full list.
