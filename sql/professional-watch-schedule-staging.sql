-- Staging only: daily source-import refresh; does not send email, SMS, or court filings.
create extension if not exists pg_cron;
select cron.schedule('professional-source-refresh-staging','0 15 * * *','select public.professional_refresh_watch();');
