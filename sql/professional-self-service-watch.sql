begin;
create or replace function public.professional_refresh_watch_due() returns integer language plpgsql security invoker set search_path='' as $$
declare n integer; day_now date := (now() at time zone 'America/New_York')::date;
begin
 insert into public.professional_watch_observations(case_id,checked_at,overdue_tasks,upcoming_tasks,verified_events,last_verified_at)
 select e.case_id,now(),
 (select count(*) from public.professional_watch_tasks t where t.case_id=e.case_id and not t.completed and t.due_date<day_now),
 (select count(*) from public.professional_watch_tasks t where t.case_id=e.case_id and not t.completed and t.due_date between day_now and day_now+7),
 (select count(*) from public.professional_verified_court_events v where v.case_id=e.case_id),
 (select max(v.verified_at) from public.professional_verified_court_events v where v.case_id=e.case_id)
 from public.professional_watch_enrollments e join public.professional_pilot_orgs o on o.id=e.org_id join public.professional_pilot_members m on m.org_id=e.org_id and m.user_id=e.attorney_id
 where e.enabled and e.consent_confirmed and o.active and m.active and ((m.attorney_verified and m.role='attorney') or (o.access_kind='paid' and o.self_service_terms_at is not null and m.role='staff' and not m.attorney_verified))
 and ((o.access_kind='pilot' and o.client_intake_enabled and o.starts_at<=now() and o.ends_at>now()) or
 (o.access_kind='paid' and exists(select 1 from public.professional_live_billing b where b.org_id=o.id and b.approved and b.stripe_subscription_id is not null and b.checked_at>now()-interval '24 hours') and o.client_intake_enabled))
 on conflict(case_id) do update set checked_at=excluded.checked_at,overdue_tasks=excluded.overdue_tasks,upcoming_tasks=excluded.upcoming_tasks,verified_events=excluded.verified_events,last_verified_at=excluded.last_verified_at;
 get diagnostics n=row_count;return n;
end $$;

commit;
