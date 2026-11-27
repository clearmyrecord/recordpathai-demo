-- Staging-only professional billing authorization and opt-in source monitoring.
begin;
create table public.professional_billing_sandbox (
 org_id uuid primary key references public.professional_pilot_orgs(id),
 authorized_user uuid not null,
 stripe_customer_id text not null unique check(stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 plan text not null check(plan in ('solo','firm')),
 active boolean not null default false,
 foreign key(org_id,authorized_user) references public.professional_pilot_members(org_id,user_id)
);
alter table public.professional_billing_sandbox enable row level security;
revoke all on public.professional_billing_sandbox from public,anon,authenticated;
grant select on public.professional_billing_sandbox to authenticated;
grant select,insert,update,delete on public.professional_billing_sandbox to service_role;
create policy professional_billing_sandbox_read on public.professional_billing_sandbox for select to authenticated using
(active and authorized_user=(select auth.uid()) and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_billing_sandbox.org_id and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active));

create table public.professional_watch_enrollments (
 org_id uuid not null, case_id uuid primary key, attorney_id uuid not null default auth.uid(),
 enabled boolean not null default true,
 consent_confirmed boolean not null check(consent_confirmed),
 created_at timestamptz not null default now(),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id)
);
create table public.professional_watch_observations (
 case_id uuid primary key references public.professional_watch_enrollments(case_id) on delete cascade,
 checked_at timestamptz not null,
 source_as_of date,
 status text not null check(status in ('no_approved_feed','no_verified_match','ambiguous_match','verified_source_match')),
 source_updated_at timestamptz,
 source_changed boolean not null default false,
 last_verified_source_id uuid
);
alter table public.professional_watch_enrollments enable row level security;
alter table public.professional_watch_observations enable row level security;
revoke all on public.professional_watch_enrollments,public.professional_watch_observations from public,anon,authenticated;
grant select on public.professional_watch_enrollments to authenticated;
grant insert(org_id,case_id,consent_confirmed),update(enabled) on public.professional_watch_enrollments to authenticated;
grant select(case_id,checked_at,source_as_of,status,source_updated_at,source_changed) on public.professional_watch_observations to authenticated;
grant select,insert,update,delete on public.professional_watch_enrollments,public.professional_watch_observations to service_role;
create policy professional_watch_read on public.professional_watch_enrollments for select to authenticated using
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_enrollments.case_id and c.org_id=professional_watch_enrollments.org_id and c.attorney_id=professional_watch_enrollments.attorney_id));
create policy professional_watch_insert on public.professional_watch_enrollments for insert to authenticated with check
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_enrollments.case_id and c.org_id=professional_watch_enrollments.org_id and c.attorney_id=professional_watch_enrollments.attorney_id));
create policy professional_watch_update on public.professional_watch_enrollments for update to authenticated using
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_enrollments.case_id and c.org_id=professional_watch_enrollments.org_id and c.attorney_id=professional_watch_enrollments.attorney_id))
with check(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_enrollments.case_id and c.org_id=professional_watch_enrollments.org_id and c.attorney_id=professional_watch_enrollments.attorney_id));
create policy professional_watch_observation_read on public.professional_watch_observations for select to authenticated using
(exists(select 1 from public.professional_watch_enrollments e where e.case_id=professional_watch_observations.case_id and e.enabled));
-- A newer approved import is not evidence of a court ruling. Never infer eligibility or sealing from missing records.
create function public.professional_refresh_watch() returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 with active_cases as (
 select e.case_id,c.case_number,p.full_name
 from public.professional_watch_enrollments e
 join public.professional_cases c on c.id=e.case_id and c.org_id=e.org_id and c.attorney_id=e.attorney_id
 join public.professional_clients p on p.id=c.client_id and p.org_id=c.org_id and p.attorney_id=c.attorney_id
 join public.professional_pilot_orgs o on o.id=e.org_id
 join public.professional_pilot_members m on m.org_id=e.org_id and m.user_id=e.attorney_id
 where e.enabled and e.consent_confirmed and p.authorization_confirmed and o.active and o.client_intake_enabled and o.starts_at<=now() and o.ends_at>now() and m.active and m.attorney_verified and m.role='attorney' and c.court_id='oh-wood-common-pleas'
 ), latest as (
 select id,data_as_of from public.court_source_import_batches
 where jurisdiction_state='OH' and county_fips='39173' and status='approved_for_internal_matching'
 and reviewed_at is not null and data_as_of is not null and data_as_of<=current_date
 order by data_as_of desc,reviewed_at desc,id limit 1
 ), matched as (
 select a.case_id,b.data_as_of,b.id as batch_id,count(v.id) as matches,
 (array_agg(v.id order by v.id) filter(where v.id is not null))[1] as source_id,
 max(v.source_last_updated_at) as source_updated
 from active_cases a left join latest b on true
 left join public.court_source_case_versions v on v.batch_id=b.id and v.state='OH' and v.county_fips='39173'
 and lower(trim(v.court_name)) in ('wood county court of common pleas','wood county common pleas court')
 and upper(trim(v.case_number))=upper(trim(a.case_number))
 and lower(regexp_replace(trim(v.defendant_name),'[[:space:]]+',' ','g'))=lower(regexp_replace(trim(a.full_name),'[[:space:]]+',' ','g'))
 and v.docket_review_status='reviewed' and v.record_completeness='verified_complete' and v.clerk_verified_at is not null
 group by a.case_id,b.data_as_of,b.id
 )
 insert into public.professional_watch_observations(case_id,checked_at,source_as_of,status,source_updated_at,source_changed,last_verified_source_id)
 select x.case_id,now(),x.data_as_of,
 case when x.batch_id is null then 'no_approved_feed' when x.matches=0 then 'no_verified_match' when x.matches>1 then 'ambiguous_match' else 'verified_source_match' end,
 case when x.matches=1 then x.source_updated end,
 case when x.matches=1 and old.last_verified_source_id is not null and old.last_verified_source_id<>x.source_id then true else coalesce(old.source_changed,false) end,
 case when x.matches=1 then x.source_id else old.last_verified_source_id end
 from matched x left join public.professional_watch_observations old on old.case_id=x.case_id
 on conflict(case_id) do update set checked_at=excluded.checked_at,source_as_of=excluded.source_as_of,status=excluded.status,source_updated_at=excluded.source_updated_at,source_changed=excluded.source_changed,last_verified_source_id=excluded.last_verified_source_id;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.professional_refresh_watch() from public,anon,authenticated;
grant execute on function public.professional_refresh_watch() to service_role;
commit;
