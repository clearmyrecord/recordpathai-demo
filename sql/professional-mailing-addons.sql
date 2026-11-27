-- Upgrade existing private order queue. Run through staging first.
begin;
alter table public.professional_mail_orders
 add column if not exists court_fee_cents integer not null default 10000 check(court_fee_cents in (0,10000)),
 add column if not exists lob_letter_id text unique check(lob_letter_id ~ '^ltr_[A-Za-z0-9]+$');
-- Replace old check-only submission constraint without changing payment/claim checks.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.professional_mail_orders'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%submitted_to_lob%' and pg_get_constraintdef(oid) like '%lob_check_id IS NOT NULL%'
 loop execute format('alter table public.professional_mail_orders drop constraint %I',c.conname); end loop;
end $$;
alter table public.professional_mail_orders drop constraint if exists professional_mail_provider_receipt;
alter table public.professional_mail_orders add constraint professional_mail_provider_receipt check(
 (court_fee_cents=10000 and lob_letter_id is null and (status<>'submitted_to_lob' or lob_check_id is not null))
 or (court_fee_cents=0 and lob_check_id is null and (status<>'submitted_to_lob' or lob_letter_id is not null)));
create table if not exists public.professional_mail_alert_preferences (
 case_id uuid primary key references public.professional_mail_orders(case_id) on delete restrict,
 user_id uuid not null references auth.users(id), org_id uuid not null references public.professional_pilot_orgs(id),
 email text, phone text, email_enabled boolean not null default false, sms_enabled boolean not null default false,
 consent_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(not email_enabled or email is not null), check(not sms_enabled or phone ~ '^\+1[2-9][0-9]{9}$')
);
create table if not exists public.professional_mail_alert_deliveries (
 case_id uuid not null references public.professional_mail_orders(case_id) on delete restrict,
 event_key text not null, channel text not null check(channel in ('email','sms')),
 status text not null default 'claimed' check(status in ('claimed','provider_accepted','held')),
 claimed_at timestamptz not null default now(), provider_id text,
 primary key(case_id,event_key,channel)
);
alter table public.professional_mail_alert_preferences enable row level security;
alter table public.professional_mail_alert_deliveries enable row level security;
revoke all on public.professional_mail_alert_preferences,public.professional_mail_alert_deliveries from public,anon,authenticated;
grant select,insert,update on public.professional_mail_alert_preferences,public.professional_mail_alert_deliveries to service_role;
commit;
