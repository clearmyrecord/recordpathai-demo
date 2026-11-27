-- Shared consumer Step 2 field snapshot, isolated in the professional workspace.
begin;
alter table public.professional_cases add column if not exists record_details jsonb;
grant insert(record_details) on public.professional_cases to authenticated;
alter table public.professional_cases drop constraint professional_cases_court_id_check;
alter table public.professional_cases add constraint professional_cases_court_id_check check(court_id='oh-wood-common-pleas' or (court_id='review-only' and outcome='mixed'));
alter table public.professional_cases alter column disposition_date drop not null;
alter table public.professional_cases drop constraint professional_cases_charge_name_check, drop constraint professional_cases_charge_code_check, drop constraint professional_cases_charge_level_check;
alter table public.professional_cases add constraint professional_cases_charge_name_check check(length(charge_name)<=100 and (length(trim(charge_name))>0 or outcome='mixed'));
alter table public.professional_cases add constraint professional_cases_charge_code_check check(length(charge_code)<=30 and (length(trim(charge_code))>0 or outcome='mixed'));
alter table public.professional_cases add constraint professional_cases_charge_level_check check(length(charge_level)<=20 and (length(trim(charge_level))>0 or outcome='mixed'));
alter table public.professional_cases add constraint professional_cases_completed_disposition check(outcome='mixed' or disposition_date is not null);
alter table public.professional_cases add constraint professional_record_details_shape check(record_details is null or (jsonb_typeof(record_details)='object' and record_details->>'schemaVersion'='1' and jsonb_typeof(record_details->'fields')='object' and jsonb_typeof(record_details->'charges')='array' and jsonb_array_length(record_details->'charges') between 1 and 50 and octet_length(record_details::text)<=262144));
create or replace function public.professional_apply_record_details() returns trigger language plpgsql security invoker set search_path='' as $$
declare f jsonb; c jsonb; eligible_court boolean; final_outcome text;
begin
 if new.record_details is null then return new;end if;
 f:=new.record_details->'fields';c:=new.record_details->'charges'->0;
 eligible_court:=coalesce(f->>'caseState'='OH' and lower(trim(f->>'county')) in ('wood','wood county') and lower(trim(f->>'courtName'))='wood county court of common pleas' and f->>'courtType'='court-of-common-pleas',false);
 new.court_id:=case when eligible_court then 'oh-wood-common-pleas' else 'review-only' end;
 new.case_number:=trim(coalesce(f->>'caseNumber',''));
 new.judge_name:=coalesce(f->>'judgeName','');
 new.charge_name:=coalesce(c->>'charge_name','');
 new.charge_code:=coalesce(c->>'charge_code','');
 new.charge_level:=coalesce(c->>'degree','');
 new.disposition_date:=nullif(c->>'disposition_date','')::date;
 new.final_discharge_date:=nullif(c->>'discharge_date','')::date;
 new.probation_end_date:=nullif(c->>'probation_end_date','')::date;
 final_outcome:=case lower(c->>'final_disposition') when 'convicted' then 'conviction' when 'dismissed' then 'dismissal' when 'not guilty' then 'not_guilty' when 'acquitted' then 'not_guilty' else 'mixed' end;
 new.outcome:='mixed';
 if eligible_court and jsonb_array_length(new.record_details->'charges')=1 and f->>'allChargesConfirmed'='yes' and f->>'proceedingsStatus'='none' and new.disposition_date is not null and length(trim(new.charge_name))>0 and length(trim(new.charge_code))>0 and length(trim(new.charge_level))>0 and (final_outcome<>'conviction' or new.final_discharge_date is not null) then new.outcome:=final_outcome;end if;
 return new;
end $$;
revoke all on function public.professional_apply_record_details() from public,anon,authenticated;
grant execute on function public.professional_apply_record_details() to service_role;
drop trigger if exists professional_record_details_before_insert on public.professional_cases;
create trigger professional_record_details_before_insert before insert on public.professional_cases for each row execute function public.professional_apply_record_details();
commit;
