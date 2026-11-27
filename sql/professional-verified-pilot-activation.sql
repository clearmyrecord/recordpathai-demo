-- Production activation requires independently documented attorney and partner approval.
begin;
alter table public.professional_pilot_orgs add column legal_review_reference text,add column security_review_reference text,add column partner_agreement_reference text,add column activation_reviewed_at timestamptz;
alter table public.professional_pilot_orgs drop constraint professional_real_intake_release_hold;
alter table public.professional_pilot_orgs add constraint professional_real_intake_verified_release check(not client_intake_enabled or (active and legal_review_reference is not null and length(trim(legal_review_reference))>8 and security_review_reference is not null and length(trim(security_review_reference))>8 and partner_agreement_reference is not null and length(trim(partner_agreement_reference))>8 and activation_reviewed_at is not null));
-- Restrict legal/security review references to the operator.
revoke select on public.professional_pilot_orgs from authenticated;
grant select(id,pilot_code,active,starts_at,ends_at,client_intake_enabled) on public.professional_pilot_orgs to authenticated;
create function public.professional_approve_pilot_request(p_user_id uuid,p_bar_verification_reference text,p_partner_agreement_reference text,p_legal_review_reference text,p_security_review_reference text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare r public.professional_access_requests%rowtype; org uuid;
begin
 if coalesce(length(trim(p_bar_verification_reference)),0)<9 or coalesce(length(trim(p_partner_agreement_reference)),0)<9 or coalesce(length(trim(p_legal_review_reference)),0)<9 or coalesce(length(trim(p_security_review_reference)),0)<9 then raise exception 'Documented credential, contract, legal and security reviews required';end if;
 select * into r from public.professional_access_requests where user_id=p_user_id and status='pending' for update;
 if not found or r.plan not in ('legal_aid','university') then raise exception 'Pending eligible nonprofit pilot request required';end if;
 if not exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null) then raise exception 'Verified account email required';end if;
 insert into public.professional_pilot_orgs(pilot_code,active,client_intake_enabled,legal_review_reference,security_review_reference,partner_agreement_reference,activation_reviewed_at)
 values('PRO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),true,true,p_legal_review_reference,p_security_review_reference,p_partner_agreement_reference,now()) returning id into org;
 insert into public.professional_pilot_members(org_id,user_id,role,attorney_verified,active) values(org,p_user_id,'attorney',true,true);
 insert into public.professional_counsel_profiles(org_id,attorney_id,full_name,ohio_bar_number,firm_name,email,verified_at) values(org,p_user_id,r.full_name,r.ohio_bar_number,r.organization_name,r.professional_contact,now());
 update public.professional_access_requests set status='approved' where user_id=p_user_id;
 insert into public.professional_activation_audit(org_id,user_id,bar_verification_reference,partner_agreement_reference,legal_review_reference,security_review_reference) values(org,p_user_id,p_bar_verification_reference,p_partner_agreement_reference,p_legal_review_reference,p_security_review_reference);
 return org;
end $$;
create table public.professional_activation_audit(
 org_id uuid primary key references public.professional_pilot_orgs(id),user_id uuid not null references auth.users(id),bar_verification_reference text not null,partner_agreement_reference text not null,legal_review_reference text not null,security_review_reference text not null,approved_at timestamptz not null default now()
);
alter table public.professional_activation_audit enable row level security;
revoke all on public.professional_activation_audit from public,anon,authenticated;
grant select,insert on public.professional_activation_audit to service_role;
-- Operator calls this function only after independent verification. Never from browser.
revoke all on function public.professional_approve_pilot_request(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.professional_approve_pilot_request(uuid,text,text,text,text) to service_role;
commit;
