-- Production foundation for approved 90-day partners only. No synthetic data or automatic activation.
begin;
create table public.professional_pilot_orgs (
 id uuid primary key default gen_random_uuid(),
 pilot_code text not null unique check (pilot_code ~ '^PRO-[A-Z0-9]{4,16}$'),
 active boolean not null default false,
 starts_at timestamptz not null default now(),
 ends_at timestamptz not null default (now()+interval '90 days'),
 check (ends_at>starts_at and ends_at<=starts_at+interval '90 days')
);
create table public.professional_pilot_members (
 org_id uuid not null references public.professional_pilot_orgs(id),
 user_id uuid not null references auth.users(id),
 role text not null check (role in ('attorney','staff')),
 attorney_verified boolean not null default false,
 active boolean not null default false,
 primary key(org_id,user_id),
 check (not attorney_verified or role='attorney')
);
alter table public.professional_pilot_orgs enable row level security;
alter table public.professional_pilot_members enable row level security;
revoke all on public.professional_pilot_orgs,public.professional_pilot_members from public,anon,authenticated;
grant select on public.professional_pilot_orgs,public.professional_pilot_members to authenticated;
grant select,insert,update,delete on public.professional_pilot_orgs,public.professional_pilot_members to service_role;
create policy pilot_member_self on public.professional_pilot_members for select to authenticated using(user_id=(select auth.uid()) and active and (select auth.jwt()->>'aal')='aal2');
create policy pilot_org_read on public.professional_pilot_orgs for select to authenticated using(active and starts_at<=now() and ends_at>now() and exists(select 1 from public.professional_pilot_members m where m.org_id=professional_pilot_orgs.id and m.user_id=(select auth.uid()) and m.active));
create index professional_pilot_members_user_idx on public.professional_pilot_members(user_id);

alter table public.professional_pilot_orgs add column client_intake_enabled boolean not null default false;
-- Only the assigned verified attorney can read or create client records. No broad firm access.
create table public.professional_clients (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 attorney_id uuid not null default auth.uid(),
 full_name text not null check(length(trim(full_name)) between 2 and 120),
 dob date not null check(dob>date '1900-01-01' and dob<current_date),
 line1 text not null check(length(trim(line1)) between 1 and 100),
 line2 text not null default '' check(length(line2)<=40),
 city text not null check(length(trim(city)) between 1 and 60),
 state text not null check(state ~ '^[A-Z]{2}$'),
 zip text not null check(zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
 email text not null check(length(email)<=120 and position('@' in email)>1),
 phone text not null check(phone ~ '^[-+0-9 ().]{7,24}$'),
 authorization_confirmed boolean not null check(authorization_confirmed),
 created_at timestamptz not null default now(),
 unique(org_id,id,attorney_id),
 foreign key(org_id,attorney_id) references public.professional_pilot_members(org_id,user_id)
);
create table public.professional_cases (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 attorney_id uuid not null default auth.uid(),
 client_id uuid not null,
 court_id text not null default 'oh-wood-common-pleas' check(court_id='oh-wood-common-pleas'),
 case_number text not null check(length(trim(case_number)) between 1 and 45),
 judge_name text not null default '' check(length(judge_name)<=80),
 outcome text not null check(outcome in ('conviction','dismissal','not_guilty','mixed')),
 disposition_date date not null check(disposition_date<=current_date),
 final_discharge_date date check(final_discharge_date<=current_date),
 probation_end_date date check(probation_end_date<=current_date),
 charge_name text not null check(length(trim(charge_name)) between 1 and 100),
 charge_code text not null check(length(trim(charge_code)) between 1 and 30),
 charge_level text not null check(length(trim(charge_level)) between 1 and 20),
 created_at timestamptz not null default now(),
 unique(org_id,id,attorney_id),
 foreign key(org_id,client_id,attorney_id) references public.professional_clients(org_id,id,attorney_id),
 check(outcome<>'conviction' or final_discharge_date is not null),
 check(final_discharge_date is null or final_discharge_date>=disposition_date)
);
-- First restricted pilot supports single-charge matters only; related cases/mixed outcomes held.
create table public.professional_case_decisions (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 case_id uuid not null,
 attorney_id uuid not null default auth.uid(),
 decision text not null check(decision in ('hold','approved_for_unsigned_draft')),
 entire_case_reviewed boolean not null check(entire_case_reviewed),
 created_at timestamptz not null default now(),
 unique(case_id),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id)
);
create table public.professional_case_events (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 case_id uuid not null,
 attorney_id uuid not null default auth.uid(),
 event_type text not null check(event_type in ('manual_filing_reported','manual_hearing_reported','manual_order_reported','manual_followup')),
 event_date date not null,
 created_at timestamptz not null default now(),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id)
);
alter table public.professional_clients enable row level security;
alter table public.professional_cases enable row level security;
alter table public.professional_case_decisions enable row level security;
alter table public.professional_case_events enable row level security;
revoke all on public.professional_clients,public.professional_cases,public.professional_case_decisions,public.professional_case_events from public,anon,authenticated;
grant select on public.professional_clients,public.professional_cases,public.professional_case_decisions,public.professional_case_events to authenticated;
grant insert(org_id,full_name,dob,line1,line2,city,state,zip,email,phone,authorization_confirmed) on public.professional_clients to authenticated;
grant insert(org_id,client_id,case_number,judge_name,outcome,disposition_date,final_discharge_date,probation_end_date,charge_name,charge_code,charge_level) on public.professional_cases to authenticated;
grant insert(org_id,case_id,decision,entire_case_reviewed) on public.professional_case_decisions to authenticated;
grant insert(org_id,case_id,event_type,event_date) on public.professional_case_events to authenticated;
grant select,insert,update,delete on public.professional_clients,public.professional_cases,public.professional_case_decisions,public.professional_case_events to service_role;
create policy professional_clients_read on public.professional_clients for select to authenticated using (professional_clients.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_clients.org_id and o.client_intake_enabled and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active));
create policy professional_clients_insert on public.professional_clients for insert to authenticated with check (professional_clients.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_clients.org_id and o.client_intake_enabled and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active));
create index professional_clients_attorney_idx on public.professional_clients(org_id,attorney_id);
create policy professional_cases_read on public.professional_cases for select to authenticated using (professional_cases.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_cases.org_id and o.client_intake_enabled and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active));
create policy professional_cases_insert on public.professional_cases for insert to authenticated with check (professional_cases.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_cases.org_id and o.client_intake_enabled and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active));
create index professional_cases_attorney_idx on public.professional_cases(org_id,attorney_id);
create policy professional_case_decisions_read on public.professional_case_decisions for select to authenticated using (professional_case_decisions.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_case_decisions.org_id and o.client_intake_enabled and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active));
create policy professional_case_decisions_insert on public.professional_case_decisions for insert to authenticated with check (professional_case_decisions.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_case_decisions.org_id and o.client_intake_enabled and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active) and exists(select 1 from public.professional_cases c where c.id=professional_case_decisions.case_id and c.org_id=professional_case_decisions.org_id and (c.outcome<>'mixed' or professional_case_decisions.decision='hold')));
create index professional_case_decisions_attorney_idx on public.professional_case_decisions(org_id,attorney_id);
create policy professional_case_events_read on public.professional_case_events for select to authenticated using (professional_case_events.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_case_events.org_id and o.client_intake_enabled and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active));
create policy professional_case_events_insert on public.professional_case_events for insert to authenticated with check (professional_case_events.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_case_events.org_id and o.client_intake_enabled and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active) and exists(select 1 from public.professional_case_decisions d where d.case_id=professional_case_events.case_id and d.org_id=professional_case_events.org_id and d.decision='approved_for_unsigned_draft'));
create index professional_case_events_attorney_idx on public.professional_case_events(org_id,attorney_id);
-- Store small review PDFs as bounded bytea in staging, avoiding direct Storage metadata writes.
create table public.professional_signed_documents (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null, case_id uuid not null, attorney_id uuid not null,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 500 and 2097152 and substring(pdf_bytes from 1 for 5)=decode('255044462d','hex') and encode(sha256(pdf_bytes),'hex')=sha256),
 page_count integer not null check(page_count=2),
 attorney_signature_attested boolean not null check(attorney_signature_attested),
 created_at timestamptz not null default now(),
 unique(case_id,sha256),
 unique(org_id,case_id,attorney_id,id),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id)
);
create table public.professional_signed_reviews (
 document_id uuid primary key,
 org_id uuid not null, case_id uuid not null, attorney_id uuid not null default auth.uid(),
 exact_document_reviewed boolean not null check(exact_document_reviewed),
 created_at timestamptz not null default now(),
 foreign key(org_id,case_id,attorney_id,document_id) references public.professional_signed_documents(org_id,case_id,attorney_id,id)
);
alter table public.professional_signed_documents enable row level security;
alter table public.professional_signed_reviews enable row level security;
revoke all on public.professional_signed_documents,public.professional_signed_reviews from public,anon,authenticated;
grant select(id,org_id,case_id,attorney_id,sha256,page_count,attorney_signature_attested,created_at) on public.professional_signed_documents to authenticated;
grant select on public.professional_signed_reviews to authenticated;
grant insert(document_id,org_id,case_id,exact_document_reviewed) on public.professional_signed_reviews to authenticated;
grant select,insert,update,delete on public.professional_signed_documents,public.professional_signed_reviews to service_role;
create policy pro_document_read on public.professional_signed_documents for select to authenticated using
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_signed_documents.case_id and c.org_id=professional_signed_documents.org_id and c.attorney_id=professional_signed_documents.attorney_id));
create policy pro_signed_review_read on public.professional_signed_reviews for select to authenticated using
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_signed_documents d where d.id=professional_signed_reviews.document_id and d.org_id=professional_signed_reviews.org_id and d.attorney_id=professional_signed_reviews.attorney_id));
create policy pro_signed_review_insert on public.professional_signed_reviews for insert to authenticated with check
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_signed_documents d where d.id=professional_signed_reviews.document_id and d.org_id=professional_signed_reviews.org_id and d.case_id=professional_signed_reviews.case_id and d.attorney_id=professional_signed_reviews.attorney_id));
-- Existing follow-up notes are permissible before signing; a reported court filing/order/hearing requires an exact signed-document review.
drop policy professional_case_events_insert on public.professional_case_events;
create policy professional_case_events_insert on public.professional_case_events for insert to authenticated with check
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_case_decisions d where d.case_id=professional_case_events.case_id and d.org_id=professional_case_events.org_id and d.attorney_id=professional_case_events.attorney_id and d.decision='approved_for_unsigned_draft')
 and (event_type='manual_followup' or exists(select 1 from public.professional_signed_reviews r where r.case_id=professional_case_events.case_id and r.org_id=professional_case_events.org_id and r.attorney_id=professional_case_events.attorney_id)));
create index professional_signed_documents_attorney_idx on public.professional_signed_documents(org_id,attorney_id);
create index professional_signed_reviews_case_idx on public.professional_signed_reviews(case_id);
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
-- Hard gate until real-client security and operational acceptance testing is signed off.
alter table public.professional_pilot_orgs add constraint professional_real_intake_release_hold check (client_intake_enabled=false);
commit;
