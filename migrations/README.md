# Migrations

Apply in order against the project's Supabase database.

## How to apply

Open the Supabase SQL editor (or use `psql` against the connection string in
`SUPABASE_DATABASE_URL`) and run the file's contents.

> The `psql $SUPABASE_DB_URL` lines in the migration files themselves predate
> that name and were never renamed. The variable the environment actually sets
> is `SUPABASE_DATABASE_URL`; neither is read by application code, since the
> app reaches Supabase over `NEXT_PUBLIC_SUPABASE_URL` +
> `SUPABASE_SERVICE_ROLE_KEY` and never opens a direct Postgres connection.

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

### `0013_inbound_message_idempotency.sql` — apply BEFORE the code that uses it

`tella_processed_message`, the same claim-then-release-on-failure shape as
`tella_processed_notification` (0011), applied to inbound WhatsApp messages
instead of Circle webhooks.

Neither WhatsApp route deduped before this. A redelivered message re-ran the
whole handler: a second reply, and a second confirm link for a send the user
asked for once. `createPendingSend` is a plain insert by design, so nothing
downstream could tell a duplicate from a deliberate second send.

It lands before the decoder gets retries, deliberately. A retry loop on top
of a non-idempotent handler multiplies exactly the wrong thing.

> `claimMessage` fails closed, so with the table absent every inbound message
> is refused and the bot goes silent.

### `0014_user_limits.sql` — apply BEFORE the code that uses it

`tella_user_limits`: sparse per-user overrides for the spend caps that were
previously identical for everyone.

A separate table rather than columns on `tella_users`, so that NULL keeps
meaning "whatever the deployment default is now". Backfilling defaults into
every row would destroy the property `TELLA_MAX_SEND_USDC` and
`TELLA_DAILY_SEND_LIMIT_USDC` exist for: tightening one knob mid-incident
without a deploy. Most users will never have a row here, which is the
intended shape.

An override is only ever a user's own **lower** ceiling. `mergeLimits` takes
the minimum of override and default, so a higher user value cannot escape a
tightened deployment cap.

`resolveLimits` throws rather than defaulting on a read error, and
`checkSendLimits` already fails closed — "we could not read your limits" must
not resolve to "so use the generous ones".

### `0015_held_sends.sql` — apply BEFORE the code that uses it

`tella_held_send`: sends that were authorized on a normal confirm link and
then embargoed for 24 hours.

**Not** an extension of `tella_pending_send`, for three reasons. That table's
5-minute TTL is a security property (the row id IS a bearer confirm URL
sitting in a chat thread); `listActivePendingSends`,
`cancelMostRecentPendingSend` and `remindOtherPendingSends` all assume the
rows are short-lived; and the cleanup cron would sweep a held row away about
five minutes in.

A held send is authorized, not unconfirmed. The user proved their factor as
normal; only execution waits. That is what makes it safe for
`/api/cron/release-holds` to carry it out later without a further gesture —
and that job re-derives permission from scratch rather than trusting a
day-old decision: freeze, limits, balance, then an atomic claim, with the
held row's own id as Circle's idempotency key.

Held amounts count as committed against **both** the daily allowance and the
spendable balance (`sumHeldUsdc`). Without that, a queued transfer is
invisible to every check and two large holds could each pass on their own,
then both fail a day later.

Operational queries:

```sql
-- what is queued
select id, user_id, payload->>'amount' as amount, release_at
  from tella_held_send where state = 'holding' order by release_at;

-- stuck mid-execution: the job died between claiming and recording an
-- outcome. Reconcile against Circle exactly like a pending_send marked
-- 'unknown'. Should be empty.
select * from tella_held_send where state in ('executing', 'unknown');
```

The release job runs on a schedule from `.github/workflows/cron.yml`, not
from `vercel.json`. Vercel's Hobby plan permits cron jobs once per day only,
and a sub-daily expression fails the build outright — which is what silently
blocked every deployment until it was found. `CRON_SECRET` must be set both
in Vercel (the route verifies it) and as a GitHub repository secret (the
workflow sends it).

### `0016_user_channels.sql` — apply BEFORE the code that uses it

`tella_user_channel`, backfilled one row per existing user. A tella user used
to BE a phone number; this makes identity channel-plural.

**Expand only. Nothing is dropped.** `tella_users.whatsapp_number` and
`.whatsapp_channel` are still read by both token pages, `findUserByWhatsApp`,
the beneficiary lookup and the follow-up path, so they stay and keep being
written. The contract migration happens separately, once this table has been
authoritative in production long enough to trust.

The behaviour change that matters: `findOrCreateUser` no longer overwrites
`whatsapp_channel` on every inbound message. It recorded "the channel last
used" rather than "the channels available", which silently repointed every
outbound notification at whichever provider delivered most recently. This also
had to land before Telegram, since that column's CHECK from 0002 only permits
`twilio` and `meta`.

Fan-out policy, now explicit: security notices, receipts and inbound-payment
alerts go to **every** verified channel via `Promise.allSettled`;
conversational replies go to the primary only. A user whose phone was stolen
should hear about a transfer on their laptop.

Verify after applying — the three counts should match the user count:

```sql
select
  (select count(*) from tella_users) as users,
  (select count(*) from tella_user_channel) as channels,
  (select count(*) from tella_user_channel where is_primary) as primaries;
```

### `0017_security_token_kinds.sql` — apply BEFORE the code that uses it

Widens `tella_security_token.kind` to `('pin_reset', 'link_telegram')`, using
the room 0010's comment left, and adds a `payload jsonb` column.

**Ships together with the `revokeResetTokens` kind filter, not after it.**
That function marked every unused token for a user as consumed, filtered only
on `user_id`. Correct while one kind existed; the moment a second one did,
completing a PIN reset would silently kill an in-flight Telegram link and the
user would tap a deep link that did nothing.

### Environment added alongside 0007–0017

```
TELEGRAM_BOT_TOKEN=       # from @BotFather
TELEGRAM_BOT_USERNAME=    # without the @, used to build the t.me deep link
TELEGRAM_WEBHOOK_SECRET=  # random string, also passed to setWebhook
```

Telegram does not sign request bodies. The secret above, echoed back in
`X-Telegram-Bot-Api-Secret-Token`, is the only thing separating a real update
from anyone who guesses the URL, and verification fails closed when it is
unset. Register the webhook with:

```
pnpm tsx --env-file=.env set-telegram-webhook.ts
```

**Use the script, not a hand-written curl, and the reason is specific.** The
command that used to be here omitted `allowed_updates`, and Telegram's rule for
that field is *"If not specified, the previous setting will be used."* This bot
had been registered once with `allowed_updates: ["message"]`, so Telegram
delivered typed messages and silently discarded every `callback_query` — which
is what an inline-keyboard tap is.

The result was that no button on Telegram had ever worked: not Balance, not My
address, not Send, not the saved names in the send flow, and not the
`Freeze it` / `Not now` confirmation. Nothing reached the app, so nothing
appeared in its logs either. And because the curl omitted the field,
re-registering the webhook — the obvious thing to try — inherited the same
restriction and could never have fixed it.

The script always sends the list explicitly. That is the whole point of it.


**Then register the command list — this step is not optional.** Telegram's ☰
Menu button is bound to whatever `setMyCommands` last registered, and until it
is called that list is empty: the button opens, spins, and closes with nothing
in it. Users read that as a broken bot, and the linking message points them
straight at it ("Try /help to see what I do here").

```
pnpm tsx --env-file=.env set-telegram-commands.ts
```

The script holds the list and explains why each entry is on it. Re-run it
after changing the list; it is idempotent. Every command in it resolves
locally, without the decoder — see `lib/agent/fast-path.test.ts`, which pins
that. Do not add an entry the bot cannot answer offline: a command in this
menu is one tap away, so one that falls through to "I didn't understand" is
worse than no entry at all.

### `0018_google_identity.sql` — apply BEFORE the code that uses it

`tella_google_identity`, plus two more token kinds (`link_google`,
`unfreeze`).

**Match on `google_sub`, never on email.** Addresses get reassigned,
especially on Workspace domains, and matching on email is the classic
account-takeover bug in exactly this integration. `google_email` is stored
for display and alert delivery and is never a lookup key.

**The asymmetry is the design, and it is the thing to preserve:**

| Action | What Google is worth |
|---|---|
| Freeze | **Sufficient on its own.** The person who most needs it has no phone to prove anything else with, and the worst an attacker achieves is inconveniencing someone. |
| Unfreeze | **Necessary, not sufficient.** Mints a short-lived token and hands off to a page that also demands a PIN or passkey set up before the freeze. |
| Send money | Never. |

Once Google alone could unfreeze, a compromised Google account would be a
compromised wallet — and Google's own recovery is frequently phone-based, so
it is less independent of the SIM than it looks.

There is deliberately **no session and no cookie**. Each sign-in authorizes
exactly one action. The original plan called for a scoped settings session;
there is no settings surface yet, every piece of this is a single action, and
a cookie on a custodial wallet is a strictly larger bearer credential than
anything else this app issues.

### `0019_pin_set_at.sql` — apply BEFORE the code that uses it

`pin_set_at` on `tella_users`, backfilled to `created_at` for accounts that
already have a PIN.

Unfreezing requires a factor that existed **before** the freeze. That was
enforceable for passkeys, which carry `created_at`, and silently
unenforceable for PINs, which carried no timestamp — so an attacker holding
the phone could reset the PIN (permitted while frozen, to avoid a deadlock)
and then use the PIN they had just chosen to lift the freeze. Both steps are
individually allowed; only the timestamps tell them apart.

### `0020_admin_analytics.sql`

Six `stable` SQL functions backing `/admin`. Read-only by construction —
every one contains a single SELECT, and `stable` lets Postgres reject a write
if one is ever added by mistake.

SQL functions rather than queries assembled in TypeScript because PostgREST
can't express a `GROUP BY`, a `date_trunc` or a correlated subquery through
its filter syntax. The alternatives were pulling whole tables into the app to
count them, or shipping raw SQL strings from the server — neither is a habit
worth starting in a repository that moves money.

Not `security definer`: they run as the service role, which could already
read these tables, so definer would add privilege without adding capability.

```sql
select * from tella_admin_user_counts();
select * from tella_admin_daily_activity() order by day desc limit 5;
```

### Environment added alongside 0007–0018

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_STATE_SECRET=      # optional; falls back to the service-role key

EMAIL_API_URL=            # optional, Resend-shaped POST endpoint
EMAIL_API_KEY=
EMAIL_FROM=
```

Authorized redirect URI in the Google console must be exactly
`$APP_BASE_URL/api/auth/google/callback`.

Email is optional and degrades to a structured `console.error` when unset,
the same way `raiseAlert` does without `ALERT_WEBHOOK_URL` — every call site
stays correct either way and a missing provider never breaks a freeze.

### `0022_spend_reservation.sql` — apply BEFORE the code that uses it

`tella_reserve_daily_spend`, which makes the rolling 24-hour cap hold under
concurrency.

**The hole it closes.** `checkSendLimits` totalled `tella_transactions` rows to
decide whether a send fitted inside the cap, and the row for a send was written
*after* `executePendingSend` returned. So a send was invisible between passing
the check and appearing in it, and two confirm links tapped at the same moment
both read the same pre-send total and both went through. The cap bounded a
sequence of sends and did nothing about a burst — which is the shape a
compromised account actually produces.

**The shape is 0007's, deliberately.** The check and the write happen inside one
Postgres call, so parallel callers cannot all read the same total. `0007` got
its serialisation free from an upsert's row lock; a send is an append and has no
such row, so this takes `pg_advisory_xact_lock` on the user instead. The lock is
transaction-scoped and the function does nothing but arithmetic and one insert —
it is never held across the call to Circle.

**The ledger is the reservation.** No new table: the `tella_transactions` row a
send was always going to produce is written before the transfer rather than
after. Three consequences, all intended:

| Outcome | The row |
|---|---|
| Transfer succeeds | kept, completed with Circle's transaction id |
| Definite rejection | deleted — nothing moved |
| **Ambiguous** | **kept** |

That last one is a behaviour change. An ambiguous transfer previously recorded
nothing at all, so money that may well have left the wallet consumed no
allowance and never appeared in history. Keeping it is the conservative reading
and matches what the user is told.

A send in flight shows in history as Processing for about a second. It is being
processed.

**Known gap.** A process that dies between reserving and transferring leaves a
`submitted` row that never resolves and permanently consumes allowance. It is
deliberately not swept: a row whose transfer may have happened is exactly what
`0008`'s unresolved-send index exists for, and deleting it automatically would
be guessing about someone's money. The matching `tella_pending_send` row —
claimed, outcome null — appears in that index and points at it.

`reserveSend` fails closed on a missing function, so deploying the code without
the migration refuses every send.

### Environment added alongside 0007–0015

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
