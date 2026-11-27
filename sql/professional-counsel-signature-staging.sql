-- Staging only. Operator verifies counsel identity separately; no self-issued bar credentials.
begin;
create table public.professional_counsel_profiles (
 org_id uuid not null,
 attorney_id uuid not null,
 full_name text not null check(length(trim(full_name)) between 2 and 100),
 ohio_bar_number text not null check(ohio_bar_number ~ '^[0-9]{7}$'),
 firm_name text not null check(length(trim(firm_name)) between 2 and 120),
 email text not null check(length(email)<=120 and position('@' in email)>1),
 verified_at timestamptz not null,
 primary key(org_id,attorney_id),
 foreign key(org_id,attorney_id) references public.professional_pilot_members(org_id,user_id)
);
alter table public.professional_counsel_profiles enable row level security;
revoke all on public.professional_counsel_profiles from public,anon,authenticated;
grant select on public.professional_counsel_profiles to authenticated;
grant select,insert,update,delete on public.professional_counsel_profiles to service_role;
create policy professional_counsel_own_read on public.professional_counsel_profiles for select to authenticated using
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_counsel_profiles.org_id and o.client_intake_enabled and m.user_id=(select auth.uid()) and m.active and m.role='attorney' and m.attorney_verified));
alter table public.professional_signed_documents add column signature_mode text not null default 'applicant_external' check(signature_mode in ('applicant_external','counsel_assumption_staging')),
 add column counsel_name text, add column counsel_bar_number text,
 add constraint counsel_signature_fields check((signature_mode='applicant_external' and counsel_name is null and counsel_bar_number is null) or (signature_mode='counsel_assumption_staging' and counsel_name is not null and counsel_bar_number ~ '^[0-9]{7}$'));
grant select(signature_mode,counsel_name,counsel_bar_number) on public.professional_signed_documents to authenticated;
-- Counsel-assumption documents may be reviewed but cannot authorize a reported filing.
drop policy professional_case_events_insert on public.professional_case_events;
create policy professional_case_events_insert on public.professional_case_events for insert to authenticated with check
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_case_decisions d where d.case_id=professional_case_events.case_id and d.org_id=professional_case_events.org_id and d.attorney_id=professional_case_events.attorney_id and d.decision='approved_for_unsigned_draft')
 and (event_type='manual_followup' or exists(select 1 from public.professional_signed_reviews r join public.professional_signed_documents d on d.id=r.document_id where r.case_id=professional_case_events.case_id and r.org_id=professional_case_events.org_id and r.attorney_id=professional_case_events.attorney_id and d.signature_mode='applicant_external')));
commit;
