-- Time-limited, operator-granted internal QA access. Never a Stripe entitlement.
begin;
create table if not exists public.professional_test_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 org_id uuid not null references public.professional_pilot_orgs(id),
 expires_at timestamptz not null,
 granted_at timestamptz not null default now(),
 revoked_at timestamptz
);
alter table public.professional_test_access enable row level security;
revoke all on public.professional_test_access from public,anon,authenticated;
grant select,insert,update,delete on public.professional_test_access to service_role;
create or replace function public.professional_set_test_lease(p_org uuid,p_user uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare until_at timestamptz;
begin
 select least(t.expires_at,now()+interval '20 minutes') into until_at
 from public.professional_test_access t
 join public.professional_live_billing b on b.org_id=t.org_id and b.authorized_user=t.user_id and b.approved
 join public.professional_pilot_members m on m.org_id=t.org_id and m.user_id=t.user_id and m.active
 join auth.users u on u.id=t.user_id and u.email_confirmed_at is not null
 where t.org_id=p_org and t.user_id=p_user and t.revoked_at is null and t.expires_at>now();
 if not found then return false;end if;
 update public.professional_pilot_orgs set client_intake_enabled=true,ends_at=until_at
 where id=p_org and active and access_kind='paid' and self_service_terms_at is not null and starts_at<until_at;
 return found;
end $$;
revoke all on function public.professional_set_test_lease(uuid,uuid) from public,anon,authenticated;
grant execute on function public.professional_set_test_lease(uuid,uuid) to service_role;
commit;
