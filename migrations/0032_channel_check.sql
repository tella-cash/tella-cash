-- Two constraint widenings for the "do you already have a tella account on
-- the other app?" step of onboarding. Apply BEFORE the code that uses them,
-- though the code tolerates their absence (the question is simply skipped and
-- the link kind is refused with a clear error).
--
-- 1. onboarding_step gains 'awaiting_channel_check': a new WhatsApp number has
--    been greeted and asked whether it already has a Telegram account, and has
--    no wallet yet.
-- 2. tella_security_token.kind gains 'link_whatsapp': the token a Telegram
--    account mints to attach a WhatsApp number, mirroring 'link_telegram'.

alter table public.tella_users
  drop constraint if exists tella_users_onboarding_step_check;

alter table public.tella_users
  add constraint tella_users_onboarding_step_check
  check (onboarding_step in ('awaiting_channel_check', 'awaiting_name', 'completed'));

alter table public.tella_security_token
  drop constraint if exists tella_security_token_kind_check;

alter table public.tella_security_token
  add constraint tella_security_token_kind_check
  check (kind in ('pin_reset', 'link_telegram', 'link_google', 'unfreeze', 'link_whatsapp'));
