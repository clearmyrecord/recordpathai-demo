-- Production attorney onboarding; only verified account owner may submit/read a request.
-- No client information, court case records, billing, or automatic access grant.
begin;
create table public.professional_access_requests(
 user_id uuid primary key default auth.uid() references auth.users(id),
 full_name text not null check(length(trim(full_name)) between 2 and 100),
 ohio_bar_number text not null check(ohio_bar_number ~ '^[0-9]{7}$'),
 organization_name text not null check(length(trim(organization_name)) between 2 and 120),
 plan text not null check(plan in ('solo','firm','legal_aid','university')),
 professional_contact text not null check(length(professional_contact)<=120 and position('@' in professional_contact)>1),
 verification_consent boolean not null check(verification_consent),
 status text not null default 'pending' check(status in ('pending','approved','declined','withdrawn')),
 created_at timestamptz not null default now()
);
alter table public.professional_access_requests enable row level security;
revoke all on public.professional_access_requests from public,anon,authenticated;
grant select on public.professional_access_requests to authenticated;
grant insert(full_name,ohio_bar_number,organization_name,plan,professional_contact,verification_consent) on public.professional_access_requests to authenticated;
grant select,insert,update,delete on public.professional_access_requests to service_role;
create policy professional_request_own_read on public.professional_access_requests for select to authenticated using(user_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2');
create policy professional_request_own_insert on public.professional_access_requests for insert to authenticated with check(user_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and status='pending');
commit;
