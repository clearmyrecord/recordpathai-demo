-- Production RecordWatch Professional: attorney-entered tasks and independently verified events.
begin;
create table public.professional_watch_enrollments (
 org_id uuid not null,case_id uuid primary key,attorney_id uuid not null default auth.uid(),
 enabled boolean not null default true,consent_confirmed boolean not null check(consent_confirmed),
 created_at timestamptz not null default now(),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id)
);
create table public.professional_watch_tasks (
 id uuid primary key default gen_random_uuid(),org_id uuid not null,case_id uuid not null,attorney_id uuid not null default auth.uid(),
 kind text not null check(kind in ('follow_up','hearing','filing_deadline')),
 due_date date not null check(due_date between date '2000-01-01' and date '2100-01-01'),
 completed boolean not null default false,created_at timestamptz not null default now(),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id),
 unique(case_id,kind,due_date)
);
create table public.professional_verified_court_events (
 id uuid primary key default gen_random_uuid(),org_id uuid not null,case_id uuid not null,attorney_id uuid not null,
 event_key text not null check(length(event_key) between 8 and 160),
 event_type text not null check(event_type in ('received','filed','hearing_scheduled','order_granted','order_denied','other')),
 occurred_on date not null check(occurred_on<=current_date),
 evidence_url text not null check(length(evidence_url)<=2000 and evidence_url ~ '^https://(pub\.clerkofcourt\.co\.wood\.oh\.us|clerkofcourt\.co\.wood\.oh\.us)/'),
 verification_reference text not null check(length(trim(verification_reference))>=9),
 verified_at timestamptz not null default now(),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id),
 unique(case_id,event_key)
);
create table public.professional_watch_observations(
 case_id uuid primary key references public.professional_watch_enrollments(case_id) on delete cascade,
 checked_at timestamptz not null,
 overdue_tasks integer not null check(overdue_tasks>=0),
 upcoming_tasks integer not null check(upcoming_tasks>=0),
 verified_events integer not null check(verified_events>=0),
 last_verified_at timestamptz
);
alter table public.professional_watch_enrollments enable row level security;
revoke all on public.professional_watch_enrollments from public,anon,authenticated;
grant select,insert,update,delete on public.professional_watch_enrollments to service_role;
alter table public.professional_watch_tasks enable row level security;
revoke all on public.professional_watch_tasks from public,anon,authenticated;
grant select,insert,update,delete on public.professional_watch_tasks to service_role;
alter table public.professional_verified_court_events enable row level security;
revoke all on public.professional_verified_court_events from public,anon,authenticated;
grant select,insert,update,delete on public.professional_verified_court_events to service_role;
alter table public.professional_watch_observations enable row level security;
revoke all on public.professional_watch_observations from public,anon,authenticated;
grant select,insert,update,delete on public.professional_watch_observations to service_role;
grant select on public.professional_watch_enrollments,public.professional_watch_tasks,public.professional_watch_observations to authenticated;
grant select(id,org_id,case_id,attorney_id,event_key,event_type,occurred_on,evidence_url,verified_at) on public.professional_verified_court_events to authenticated;
grant insert(org_id,case_id,consent_confirmed),update(enabled) on public.professional_watch_enrollments to authenticated;
grant insert(org_id,case_id,kind,due_date),update(completed) on public.professional_watch_tasks to authenticated;
create policy professional_watch_enrollments_read on public.professional_watch_enrollments for select to authenticated using(professional_watch_enrollments.attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_enrollments.case_id and c.org_id=professional_watch_enrollments.org_id and c.attorney_id=professional_watch_enrollments.attorney_id));
create policy professional_watch_enrollments_insert on public.professional_watch_enrollments for insert to authenticated with check(professional_watch_enrollments.attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_enrollments.case_id and c.org_id=professional_watch_enrollments.org_id and c.attorney_id=professional_watch_enrollments.attorney_id));
create policy professional_watch_enrollments_update on public.professional_watch_enrollments for update to authenticated using(professional_watch_enrollments.attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_enrollments.case_id and c.org_id=professional_watch_enrollments.org_id and c.attorney_id=professional_watch_enrollments.attorney_id)) with check(professional_watch_enrollments.attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_enrollments.case_id and c.org_id=professional_watch_enrollments.org_id and c.attorney_id=professional_watch_enrollments.attorney_id));
create policy professional_watch_tasks_read on public.professional_watch_tasks for select to authenticated using(professional_watch_tasks.attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_tasks.case_id and c.org_id=professional_watch_tasks.org_id and c.attorney_id=professional_watch_tasks.attorney_id));
create policy professional_watch_tasks_insert on public.professional_watch_tasks for insert to authenticated with check(professional_watch_tasks.attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_tasks.case_id and c.org_id=professional_watch_tasks.org_id and c.attorney_id=professional_watch_tasks.attorney_id) and exists(select 1 from public.professional_watch_enrollments e where e.case_id=professional_watch_tasks.case_id and e.enabled));
create policy professional_watch_tasks_update on public.professional_watch_tasks for update to authenticated using(professional_watch_tasks.attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_tasks.case_id and c.org_id=professional_watch_tasks.org_id and c.attorney_id=professional_watch_tasks.attorney_id)) with check(professional_watch_tasks.attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_watch_tasks.case_id and c.org_id=professional_watch_tasks.org_id and c.attorney_id=professional_watch_tasks.attorney_id));
create policy professional_verified_court_events_read on public.professional_verified_court_events for select to authenticated using(professional_verified_court_events.attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_verified_court_events.case_id and c.org_id=professional_verified_court_events.org_id and c.attorney_id=professional_verified_court_events.attorney_id));
create policy professional_watch_observations_read on public.professional_watch_observations for select to authenticated using(exists(select 1 from public.professional_watch_enrollments e where e.case_id=professional_watch_observations.case_id and e.enabled));
create index professional_watch_tasks_case_idx on public.professional_watch_tasks(case_id,due_date);
create index professional_verified_events_case_idx on public.professional_verified_court_events(case_id,occurred_on);
-- No external notifications or automatic docket claims: nightly computation of saved tasks and independently verified events.
create function public.professional_refresh_watch_due() returns integer language plpgsql security invoker set search_path='' as $$
declare n integer; day_now date := (now() at time zone 'America/New_York')::date;
begin
 insert into public.professional_watch_observations(case_id,checked_at,overdue_tasks,upcoming_tasks,verified_events,last_verified_at)
 select e.case_id,now(),
 (select count(*) from public.professional_watch_tasks t where t.case_id=e.case_id and not t.completed and t.due_date<day_now),
 (select count(*) from public.professional_watch_tasks t where t.case_id=e.case_id and not t.completed and t.due_date between day_now and day_now+7),
 (select count(*) from public.professional_verified_court_events v where v.case_id=e.case_id),
 (select max(v.verified_at) from public.professional_verified_court_events v where v.case_id=e.case_id)
 from public.professional_watch_enrollments e join public.professional_pilot_orgs o on o.id=e.org_id join public.professional_pilot_members m on m.org_id=e.org_id and m.user_id=e.attorney_id
 where e.enabled and e.consent_confirmed and o.active and m.active and m.attorney_verified and m.role='attorney'
 and ((o.access_kind='pilot' and o.client_intake_enabled and o.starts_at<=now() and o.ends_at>now()) or
 (o.access_kind='paid' and exists(select 1 from public.professional_live_billing b where b.org_id=o.id and b.approved and b.stripe_subscription_id is not null and b.checked_at>now()-interval '24 hours') and o.client_intake_enabled))
 on conflict(case_id) do update set checked_at=excluded.checked_at,overdue_tasks=excluded.overdue_tasks,upcoming_tasks=excluded.upcoming_tasks,verified_events=excluded.verified_events,last_verified_at=excluded.last_verified_at;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.professional_refresh_watch_due() from public,anon,authenticated;
grant execute on function public.professional_refresh_watch_due() to service_role;
commit;
