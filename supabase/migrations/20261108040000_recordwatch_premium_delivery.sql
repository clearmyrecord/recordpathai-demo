-- RecordWatch Premium outbound alerts: explicit consent + private delivery ledger.
-- Apply after the existing lifetime-case and notification-preference migrations.
-- NO customer is auto-enrolled; live sends remain disabled until provider setup.
alter table public.recordwatch_notification_preferences
  add column if not exists email_opted_in_at timestamptz;
alter table public.recordwatch_notification_preferences
  add column if not exists sms_consent_source text;
alter table public.recordwatch_notification_preferences
  add column if not exists sms_consent_disclosure_version text;
-- No alert can depend on the old email_enabled=true default without this new
-- opt-in timestamp. Existing customers must affirm email preference in UI.
create table if not exists public.recordwatch_sms_suppressions (
  phone_number text primary key check(phone_number ~ '^[+]1[2-9][0-9]{9}$'),
  opted_out_at timestamptz not null default now(),
  source text not null default 'twilio_signed_stop'
);
create table if not exists public.recordwatch_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_case_id uuid not null references public.saved_cases(id) on delete cascade,
  kind text not null check(kind in (
    'eligibility_180_day','eligibility_90_day','eligibility_30_day',
    'eligibility_7_day','eligibility_reached','test'
  )),
  channel text not null check(channel in ('email','sms')),
  eligibility_date date not null,
  reminder_on date not null,
  status text not null default 'reserved'
    check(status in ('reserved','provider_accepted','failed_review')),
  provider text not null check(provider in ('resend','twilio')),
  provider_message_id text,
  attempt_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Prevent duplicate sends on retries, restarts, or concurrent Cloud Run instances.
  unique(saved_case_id,kind,channel,eligibility_date,reminder_on)
);
create index if not exists recordwatch_alert_deliveries_user_idx
  on public.recordwatch_alert_deliveries(user_id,attempt_at desc);
create index if not exists recordwatch_alert_deliveries_status_idx
  on public.recordwatch_alert_deliveries(status,attempt_at);
alter table public.recordwatch_sms_suppressions enable row level security;
alter table public.recordwatch_alert_deliveries enable row level security;
revoke all on public.recordwatch_sms_suppressions,public.recordwatch_alert_deliveries
  from public,anon,authenticated;
grant all on public.recordwatch_sms_suppressions,public.recordwatch_alert_deliveries
  to service_role;
-- This program does NOT grant direct browser write access to SMS consent.
-- Existing preference RLS policies are superseded for service-only consent writes.
drop policy if exists "RecordWatch preferences inserted by owner"
  on public.recordwatch_notification_preferences;
drop policy if exists "RecordWatch preferences updated by owner"
  on public.recordwatch_notification_preferences;
drop policy if exists "RecordWatch preferences readable by owner"
  on public.recordwatch_notification_preferences;
revoke insert,update,delete on public.recordwatch_notification_preferences
  from anon,authenticated;
-- Existing authenticated select may be retained for the user's own view
-- if its RLS policy is present; server API remains the authoritative route.
create table if not exists public.recordwatch_alert_migration_receipts (
 id text primary key, applied_at timestamptz not null default now()
);
alter table public.recordwatch_alert_migration_receipts enable row level security;
revoke all on public.recordwatch_alert_migration_receipts from public,anon,authenticated;
grant all on public.recordwatch_alert_migration_receipts to service_role;
insert into public.recordwatch_alert_migration_receipts(id)
 values ('20261108040000_recordwatch_premium_delivery')
 on conflict(id) do nothing;
