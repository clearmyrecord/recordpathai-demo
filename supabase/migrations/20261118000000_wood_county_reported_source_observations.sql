-- Add-only Wood County historical source observations; private RLS remains.
-- A clerk export's status/date and spreadsheet color are NOT a final legal decision.
-- Requires the 20261107000000 private-court-source staging migration first.
alter table public.court_source_charge_versions
 add column if not exists reported_charge_status text,
 add column if not exists reported_charge_status_date date,
 add column if not exists source_report_year integer,
 add column if not exists source_statute_raw text,
 add column if not exists source_statute_audit text,
 add column if not exists source_screen_color text;

alter table public.court_source_charge_versions
 add constraint source_report_year_plausible
 check (source_report_year is null or source_report_year between 1900 and 2200);

alter table public.court_source_charge_versions
 add constraint source_screen_color_allowed
 check (source_screen_color is null or source_screen_color in ('blue','green','red','yellow'));

comment on column public.court_source_charge_versions.reported_charge_status
 is 'Unverified annual court extract observation; not final court judgment or certified disposition.';
comment on column public.court_source_charge_versions.reported_charge_status_date
 is 'Date reported in source charge extract; does not prove final discharge.';
comment on column public.court_source_charge_versions.source_screen_color
 is 'Provisional spreadsheet cohort, never a legal eligibility, payment or filing approval.';

-- No policy, role grant, view or public lookup is added by this migration.
