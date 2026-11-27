-- Production only: private daily reminder summaries; no external court polling or messaging.
create extension if not exists pg_cron;
select cron.schedule('professional-watch-due-production','10 15 * * *','select public.professional_refresh_watch_due();');
