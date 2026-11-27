-- Paid accounts are preapproved by the operator, and have a short Stripe-verified access lease.
begin;
alter table public.professional_pilot_orgs add column access_kind text not null default 'pilot' check(access_kind in ('pilot','paid'));
alter table public.professional_pilot_orgs drop constraint professional_pilot_orgs_check;
alter table public.professional_pilot_orgs add constraint professional_org_window check(ends_at>starts_at and (access_kind='paid' or ends_at<=starts_at+interval '90 days'));
grant select(access_kind) on public.professional_pilot_orgs to authenticated;
create table public.professional_live_billing(
 org_id uuid primary key references public.professional_pilot_orgs(id),
 authorized_user uuid not null unique,
 plan text not null check(plan in ('solo','firm')),
 stripe_customer_id text not null unique check(stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 approved boolean not null default false,
 stripe_subscription_id text unique check(stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
 checked_at timestamptz,
 foreign key(org_id,authorized_user) references public.professional_pilot_members(org_id,user_id)
);
alter table public.professional_live_billing enable row level security;
revoke all on public.professional_live_billing from public,anon,authenticated;
grant select on public.professional_live_billing to authenticated;
grant select,insert,update,delete on public.professional_live_billing to service_role;
create policy professional_live_billing_owner on public.professional_live_billing for select to authenticated using
(approved and authorized_user=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_members m where m.org_id=professional_live_billing.org_id and m.user_id=(select auth.uid()) and m.role='attorney' and m.attorney_verified and m.active));
create function public.professional_approve_paid_request(p_user_id uuid,p_customer text,p_bar_reference text,p_agreement_reference text,p_legal_reference text,p_security_reference text) returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.professional_access_requests%rowtype; org uuid;
begin
 if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$' or least(coalesce(length(trim(p_bar_reference)),0),coalesce(length(trim(p_agreement_reference)),0),coalesce(length(trim(p_legal_reference)),0),coalesce(length(trim(p_security_reference)),0))<9 then raise exception 'Verified customer and documented reviews required';end if;
 select * into r from public.professional_access_requests where user_id=p_user_id and status='pending' for update;
 if not found or r.plan not in ('solo','firm') then raise exception 'Pending paid professional request required';end if;
 if not exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null) then raise exception 'Verified account email required';end if;
 insert into public.professional_pilot_orgs(pilot_code,active,client_intake_enabled,access_kind,legal_review_reference,security_review_reference,partner_agreement_reference,activation_reviewed_at)
 values('PRO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),true,false,'paid',p_legal_reference,p_security_reference,p_agreement_reference,now()) returning id into org;
 insert into public.professional_pilot_members(org_id,user_id,role,attorney_verified,active) values(org,p_user_id,'attorney',true,true);
 insert into public.professional_counsel_profiles(org_id,attorney_id,full_name,ohio_bar_number,firm_name,email,verified_at) values(org,p_user_id,r.full_name,r.ohio_bar_number,r.organization_name,r.professional_contact,now());
 insert into public.professional_activation_audit(org_id,user_id,bar_verification_reference,partner_agreement_reference,legal_review_reference,security_review_reference) values(org,p_user_id,p_bar_reference,p_agreement_reference,p_legal_reference,p_security_reference);
 insert into public.professional_live_billing(org_id,authorized_user,plan,stripe_customer_id,approved) values(org,p_user_id,r.plan,p_customer,true);
 update public.professional_access_requests set status='approved' where user_id=p_user_id;
 return org;
end $$;
revoke all on function public.professional_approve_paid_request(uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
-- Server-only RPC; called after direct live Stripe retrieval. Never accept a browser entitlement claim.
create function public.professional_set_paid_lease(p_org uuid,p_user uuid,p_customer text,p_subscription text,p_period_end timestamptz,p_verified boolean) returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.professional_live_billing%rowtype; until_at timestamptz;
begin
 select * into b from public.professional_live_billing where org_id=p_org and authorized_user=p_user and stripe_customer_id=p_customer and approved for update;
 if not found then return false;end if;
 if not exists(select 1 from public.professional_pilot_members m where m.org_id=p_org and m.user_id=p_user and m.role='attorney' and m.active and m.attorney_verified) then return false;end if;
 if p_verified and p_subscription is not null and p_subscription ~ '^sub_[A-Za-z0-9]+$' and p_period_end>now() then
  until_at=least(p_period_end,now()+interval '20 minutes');
  update public.professional_pilot_orgs set client_intake_enabled=true,ends_at=until_at where id=p_org and active and access_kind='paid' and starts_at<until_at;
  if not found then return false;end if;
  update public.professional_live_billing set stripe_subscription_id=p_subscription,checked_at=now() where org_id=p_org;
  return true;
 end if;
 update public.professional_pilot_orgs set client_intake_enabled=false where id=p_org and access_kind='paid';
 update public.professional_live_billing set checked_at=now() where org_id=p_org;
 return false;
end $$;
revoke all on function public.professional_set_paid_lease(uuid,uuid,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.professional_set_paid_lease(uuid,uuid,text,text,timestamptz,boolean) to service_role;
commit;
