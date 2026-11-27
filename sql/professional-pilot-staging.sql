-- Staging-only design-partner workspace. No real client data or live filing.
-- Operator provisions verified memberships and pilot windows; never self-service.
begin;
create table public.professional_pilot_orgs (
 id uuid primary key default gen_random_uuid(),
 pilot_code text not null unique check (pilot_code ~ '^DEMO-[A-Z0-9]{4,16}$'),
 active boolean not null default false,
 starts_at timestamptz not null default now(),
 ends_at timestamptz not null default (now()+interval '7 days'),
 check (ends_at>starts_at and ends_at<=starts_at+interval '7 days')
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
create table public.professional_pilot_matters (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.professional_pilot_orgs(id),
 created_by uuid not null default auth.uid(),
 court_id text not null default 'oh-wood-common-pleas' check(court_id='oh-wood-common-pleas'),
 scenario text not null check(scenario in ('conviction','dismissal','mixed')),
 created_at timestamptz not null default now(),
 unique(org_id,id),
 foreign key(org_id,created_by) references public.professional_pilot_members(org_id,user_id)
);
create table public.professional_pilot_reviews (
 org_id uuid not null,
 matter_id uuid not null,
 reviewer_id uuid not null default auth.uid(),
 decision text not null check(decision in ('mock_review_complete','needs_review')),
 reviewed_at timestamptz not null default now(),
 primary key(matter_id),
 foreign key(org_id,matter_id) references public.professional_pilot_matters(org_id,id),
 foreign key(org_id,reviewer_id) references public.professional_pilot_members(org_id,user_id)
);
alter table public.professional_pilot_orgs enable row level security;
alter table public.professional_pilot_members enable row level security;
alter table public.professional_pilot_matters enable row level security;
alter table public.professional_pilot_reviews enable row level security;
revoke all on public.professional_pilot_orgs,public.professional_pilot_members,public.professional_pilot_matters,public.professional_pilot_reviews from public,anon,authenticated;
grant select on public.professional_pilot_orgs,public.professional_pilot_members,public.professional_pilot_matters,public.professional_pilot_reviews to authenticated;
grant insert(org_id,scenario) on public.professional_pilot_matters to authenticated;
grant insert(org_id,matter_id,decision) on public.professional_pilot_reviews to authenticated;
grant select,insert,update,delete on public.professional_pilot_orgs,public.professional_pilot_members,public.professional_pilot_matters,public.professional_pilot_reviews to service_role;
create policy pilot_member_self on public.professional_pilot_members for select to authenticated
 using (user_id=(select auth.uid()) and active and (select auth.jwt()->>'aal')='aal2');
create policy pilot_org_read on public.professional_pilot_orgs for select to authenticated
 using (active and starts_at<=now() and ends_at>now() and exists(select 1 from public.professional_pilot_members m where m.org_id=id and m.user_id=(select auth.uid()) and m.active));
create policy pilot_matters_read on public.professional_pilot_matters for select to authenticated
 using (exists(select 1 from public.professional_pilot_orgs o where o.id=org_id));
create policy pilot_matters_insert on public.professional_pilot_matters for insert to authenticated
 with check (created_by=(select auth.uid()) and exists(select 1 from public.professional_pilot_orgs o where o.id=org_id));
create policy pilot_reviews_read on public.professional_pilot_reviews for select to authenticated
 using (exists(select 1 from public.professional_pilot_orgs o where o.id=org_id));
create policy pilot_reviews_insert on public.professional_pilot_reviews for insert to authenticated
 with check (reviewer_id=(select auth.uid()) and exists(select 1 from public.professional_pilot_orgs o where o.id=org_id)
 and exists(select 1 from public.professional_pilot_members m where m.org_id=professional_pilot_reviews.org_id and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active)
 and exists(select 1 from public.professional_pilot_matters c where c.id=matter_id and c.org_id=professional_pilot_reviews.org_id and (c.scenario<>'mixed' or decision='needs_review')));
create index professional_pilot_members_user_idx on public.professional_pilot_members(user_id);
create index professional_pilot_matters_org_idx on public.professional_pilot_matters(org_id);
create index professional_pilot_reviews_org_idx on public.professional_pilot_reviews(org_id);
commit;
