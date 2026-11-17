-- =============================================================
-- Email notification setup — run once in the Supabase SQL Editor AFTER
-- applying migration 0022 and deploying the `email-notify` function.
-- Do NOT commit a copy with the real secret filled in.
--
-- 0. In Resend: add and verify your sending domain (DNS records), then
--    create an API key with "Sending access".
-- 1. Set the function secrets (CLI):
--      supabase secrets set EMAIL_NOTIFY_SECRET=<random-string> \
--        RESEND_API_KEY=re_xxx \
--        EMAIL_FROM="TaskApp <taskapp@<your-verified-domain>>" \
--        APP_URL=https://<your-taskapp-domain>
-- 2. supabase functions deploy email-notify --no-verify-jwt
-- 3. Run the statements below with the same <random-string>.
-- =============================================================

-- Remove old values first so this script can be re-run.
delete from vault.secrets where name in ('email_notify_url', 'email_notify_secret');

select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/email-notify',
  'email_notify_url'
);
select vault.create_secret('<EMAIL_NOTIFY_SECRET>', 'email_notify_secret');

-- Check:
--   select * from net._http_response order by created desc limit 5;
--   select * from public.email_notification_log order by created_at desc limit 20;
-- Turn notifications off: delete from vault.secrets where name = 'email_notify_url';
