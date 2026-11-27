-- Self-service paid software access. Membership does not certify an attorney.
begin;
alter table public.professional_pilot_orgs add column self_service_terms_at timestamptz;
grant select(self_service_terms_at) on public.professional_pilot_orgs to authenticated;
alter table public.professional_pilot_orgs drop constraint professional_real_intake_verified_release;
alter table public.professional_pilot_orgs add constraint professional_real_intake_verified_release check(not client_intake_enabled or (active and ((access_kind='paid' and self_service_terms_at is not null) or (legal_review_reference is not null and length(trim(legal_review_reference))>8 and security_review_reference is not null and length(trim(security_review_reference))>8 and partner_agreement_reference is not null and length(trim(partner_agreement_reference))>8 and activation_reviewed_at is not null))));
create function public.professional_create_self_service(p_user uuid,p_customer text,p_plan text) returns uuid language plpgsql security invoker set search_path='' as $$
declare org uuid; b public.professional_live_billing%rowtype;
begin
 if p_plan not in ('solo','firm') or p_plan is null or p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Invalid plan or customer';end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Verified email required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into b from public.professional_live_billing where authorized_user=p_user;
 if found then
  if b.stripe_customer_id<>p_customer or b.plan<>p_plan or not b.approved then raise exception 'Existing account requires support';end if;
  return b.org_id;
 end if;
 insert into public.professional_pilot_orgs(pilot_code,active,client_intake_enabled,access_kind,self_service_terms_at)
 values('PRO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),true,false,'paid',now()) returning id into org;
 insert into public.professional_pilot_members(org_id,user_id,role,attorney_verified,active) values(org,p_user,'staff',false,true);
 insert into public.professional_live_billing(org_id,authorized_user,plan,stripe_customer_id,approved) values(org,p_user,p_plan,p_customer,true);
 return org;
end $$;
revoke all on function public.professional_create_self_service(uuid,text,text) from public,anon,authenticated;
grant execute on function public.professional_create_self_service(uuid,text,text) to service_role;
create or replace function public.professional_set_paid_lease(p_org uuid,p_user uuid,p_customer text,p_subscription text,p_period_end timestamptz,p_verified boolean) returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.professional_live_billing%rowtype; until_at timestamptz;
begin
 select * into b from public.professional_live_billing where org_id=p_org and authorized_user=p_user and stripe_customer_id=p_customer and approved for update;
 if not found then return false;end if;
 if not exists(select 1 from public.professional_pilot_members m where m.org_id=p_org and m.user_id=p_user and m.active and ((m.role='attorney' and m.attorney_verified) or (m.role='staff' and not m.attorney_verified and exists(select 1 from public.professional_pilot_orgs o where o.id=m.org_id and o.access_kind='paid' and o.self_service_terms_at is not null)))) then return false;end if;
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

alter policy professional_live_billing_owner on public.professional_live_billing using(approved and authorized_user=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_members m where m.org_id=professional_live_billing.org_id and m.user_id=(select auth.uid()) and m.active));
alter policy professional_clients_read on public.professional_clients using (professional_clients.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_clients.org_id and o.client_intake_enabled and o.active and o.starts_at<=now() and o.ends_at>now() and m.user_id=(select auth.uid()) and m.active and ((m.role='attorney' and m.attorney_verified) or (o.access_kind='paid' and o.self_service_terms_at is not null and m.role='staff' and not m.attorney_verified))));
alter policy professional_clients_insert on public.professional_clients with check (professional_clients.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_clients.org_id and o.client_intake_enabled and o.active and o.starts_at<=now() and o.ends_at>now() and m.user_id=(select auth.uid()) and m.active and ((m.role='attorney' and m.attorney_verified) or (o.access_kind='paid' and o.self_service_terms_at is not null and m.role='staff' and not m.attorney_verified))));
alter policy professional_cases_read on public.professional_cases using (professional_cases.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_cases.org_id and o.client_intake_enabled and o.active and o.starts_at<=now() and o.ends_at>now() and m.user_id=(select auth.uid()) and m.active and ((m.role='attorney' and m.attorney_verified) or (o.access_kind='paid' and o.self_service_terms_at is not null and m.role='staff' and not m.attorney_verified))));
alter policy professional_cases_insert on public.professional_cases with check (professional_cases.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_cases.org_id and o.client_intake_enabled and o.active and o.starts_at<=now() and o.ends_at>now() and m.user_id=(select auth.uid()) and m.active and ((m.role='attorney' and m.attorney_verified) or (o.access_kind='paid' and o.self_service_terms_at is not null and m.role='staff' and not m.attorney_verified))));
alter policy professional_case_decisions_read on public.professional_case_decisions using (professional_case_decisions.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_case_decisions.org_id and o.client_intake_enabled and o.active and o.starts_at<=now() and o.ends_at>now() and m.user_id=(select auth.uid()) and m.active and ((m.role='attorney' and m.attorney_verified) or (o.access_kind='paid' and o.self_service_terms_at is not null and m.role='staff' and not m.attorney_verified))));
alter policy professional_case_decisions_insert on public.professional_case_decisions with check (professional_case_decisions.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_case_decisions.org_id and o.client_intake_enabled and o.active and o.starts_at<=now() and o.ends_at>now() and m.user_id=(select auth.uid()) and m.active and ((m.role='attorney' and m.attorney_verified) or (o.access_kind='paid' and o.self_service_terms_at is not null and m.role='staff' and not m.attorney_verified))) and exists(select 1 from public.professional_cases c where c.id=professional_case_decisions.case_id and c.org_id=professional_case_decisions.org_id and (c.outcome<>'mixed' or professional_case_decisions.decision='hold')));
alter policy professional_case_events_read on public.professional_case_events using (professional_case_events.attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_pilot_orgs o join public.professional_pilot_members m on m.org_id=o.id where o.id=professional_case_events.org_id and o.client_intake_enabled and o.active and o.starts_at<=now() and o.ends_at>now() and m.user_id=(select auth.uid()) and m.active and ((m.role='attorney' and m.attorney_verified) or (o.access_kind='paid' and o.self_service_terms_at is not null and m.role='staff' and not m.attorney_verified))));
commit;
