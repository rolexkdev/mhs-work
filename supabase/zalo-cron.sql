-- =============================================================
-- Lịch nhắc việc Zalo — chạy 1 lần trong Supabase SQL Editor SAU KHI đã
-- deploy function `zalo-daily-reminder`. KHÔNG commit bản đã điền secret.
--
-- 00:30 UTC = 7:30 sáng giờ Việt Nam, Thứ 2 → Thứ 7 (1-6).
-- Cần bật extension pg_cron và pg_net (Database → Extensions).
-- =============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('zalo-daily-reminder')
where exists (select 1 from cron.job where jobname = 'zalo-daily-reminder');

select cron.schedule(
  'zalo-daily-reminder',
  '30 0 * * 1-6',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/zalo-daily-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', '<REMINDER_CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Kiểm tra: select * from cron.job_run_details order by start_time desc limit 5;
--           select * from public.zalo_reminder_log order by created_at desc limit 20;
