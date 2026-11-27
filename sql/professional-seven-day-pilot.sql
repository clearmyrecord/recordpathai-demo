-- Applied November 27, 2026 to staging and production; no existing pilots.
-- Paid subscription access remains exempt from the pilot window limit.
begin;
alter table public.professional_pilot_orgs alter column ends_at set default (now()+interval '7 days');
do $$
begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='professional_pilot_orgs' and column_name='access_kind') then
  alter table public.professional_pilot_orgs drop constraint professional_org_window, add constraint professional_org_window check (ends_at>starts_at and (access_kind='paid' or ends_at<=starts_at+interval '7 days'));
 else
  alter table public.professional_pilot_orgs drop constraint professional_pilot_orgs_check, add constraint professional_pilot_orgs_check check (ends_at>starts_at and ends_at<=starts_at+interval '7 days');
 end if;
end $$;
commit;
