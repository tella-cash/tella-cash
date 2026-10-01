-- A sweep's Arc mint arrives at the user's wallet as an ordinary inbound
-- transaction. The circle webhook must recognise it as the end of a sweep, not
-- announce it as money from a stranger, and must do so exactly once per sweep.
--
-- mint_matched_at is that "exactly once": the webhook claims it with a
-- conditional update, so two deliveries of the same notification (or two
-- different notifications that could both fit the same sweep) cannot both
-- consume it.
--
-- Apply after 0029. Safe to apply before the code that uses it.

alter table public.tella_sweeps
  add column if not exists mint_matched_at timestamptz;
