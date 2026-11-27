-- Serialize subscription checkout creation and changes across Cloud Run instances.
-- No public/client grants; existing subscriber data and payment leases are untouched.
begin;
create table if not exists public.professional_checkout_locks (
 user_id uuid primary key references auth.users(id) on delete cascade,
 token uuid not null,
 expires_at timestamptz not null
);
alter table public.professional_checkout_locks enable row level security;
revoke all on public.professional_checkout_locks from public,anon,authenticated;
grant select,insert,update,delete on public.professional_checkout_locks to service_role;

create or replace function public.professional_claim_checkout(p_user uuid,p_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then return false; end if;
 insert into public.professional_checkout_locks(user_id,token,expires_at)
 values(p_user,p_token,now()+interval '10 minutes')
 on conflict(user_id) do update set token=excluded.token,expires_at=excluded.expires_at
 where professional_checkout_locks.expires_at<=now();
 return found;
end $$;

create or replace function public.professional_release_checkout(p_user uuid,p_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 delete from public.professional_checkout_locks where user_id=p_user and token=p_token;
 return found;
end $$;

create or replace function public.professional_select_checkout_plan(p_user uuid,p_token uuid,p_org uuid,p_customer text,p_plan text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_plan is null or p_plan not in ('solo','firm') then return false; end if;
 if not exists(select 1 from public.professional_checkout_locks where user_id=p_user and token=p_token and expires_at>now() for update) then return false; end if;
 update public.professional_live_billing b set plan=p_plan
 where b.authorized_user=p_user and b.org_id=p_org and b.stripe_customer_id=p_customer and b.approved
 and exists(select 1 from public.professional_pilot_orgs o where o.id=b.org_id and o.active and o.access_kind='paid' and not o.client_intake_enabled);
 return found;
end $$;
revoke all on function public.professional_claim_checkout(uuid,uuid),public.professional_release_checkout(uuid,uuid),public.professional_select_checkout_plan(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.professional_claim_checkout(uuid,uuid),public.professional_release_checkout(uuid,uuid),public.professional_select_checkout_plan(uuid,uuid,uuid,text,text) to service_role;
commit;
