begin;
create or replace function public.professional_create_self_service(p_user uuid,p_customer text,p_plan text) returns uuid language plpgsql security invoker set search_path='' as $$
declare org uuid; b public.professional_live_billing%rowtype;
begin
 if p_plan not in ('solo','firm') or p_plan is null or p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Invalid plan or customer';end if;
 -- The server validates a confirmed email via the Auth API; this service-only RPC uses the auth.users foreign key, not privileged reads of auth.users.
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

commit;
