-- RecordPathAI RecordWatch database bootstrap (November 8, 2026)
-- Only run in Supabase project pfyxjhdlqgpzzzdssqpk after confirming that
-- public.cases, public.saved_cases, public.user_ledger_entries and
-- public.recordwatch_subscriptions are missing. Run as postgres.
-- One transaction prevents partial installation if any step fails.
-- Existing Stripe secrets and user credentials are NOT part of this SQL.
-- These source migrations are copied in their original dependency order.
--
BEGIN;

DO $bootstrap_preflight$
BEGIN
  IF to_regclass('public.recordwatch_subscriptions') IS NOT NULL
    OR to_regclass('public.cases') IS NOT NULL
    OR to_regclass('public.user_ledger_entries') IS NOT NULL
    OR to_regclass('public.saved_cases') IS NOT NULL THEN
    RAISE EXCEPTION 'RecordWatch bootstrap aborted: existing core table found. Review applied migrations; do not run full bootstrap.';
  END IF;
END;
$bootstrap_preflight$;


-- ==================================================================
-- STEP 1 of 6: 20260530000000_create_profiles_and_cases.sql
-- ==================================================================
-- RecordPathAI Supabase Auth support.
-- Run this migration in the Supabase SQL editor or with the Supabase CLI.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_state text,
  county text,
  court text,
  case_number text,
  eligibility_status text,
  estimated_eligible_date text,
  packet_status text,
  payment_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cases_user_id_idx on public.cases(user_id);
create unique index if not exists cases_user_case_number_idx on public.cases(user_id, case_number) where case_number is not null;

alter table public.profiles enable row level security;
alter table public.cases enable row level security;

drop policy if exists "Profiles are readable by owner" on public.profiles;
create policy "Profiles are readable by owner" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Profiles are inserted by owner" on public.profiles;
create policy "Profiles are inserted by owner" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Profiles are updated by owner" on public.profiles;
create policy "Profiles are updated by owner" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Cases are readable by owner" on public.cases;
create policy "Cases are readable by owner" on public.cases
  for select using (auth.uid() = user_id);

drop policy if exists "Cases are inserted by owner" on public.cases;
create policy "Cases are inserted by owner" on public.cases
  for insert with check (auth.uid() = user_id);

drop policy if exists "Cases are updated by owner" on public.cases;
create policy "Cases are updated by owner" on public.cases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Cases are deleted by owner" on public.cases;
create policy "Cases are deleted by owner" on public.cases
  for delete using (auth.uid() = user_id);

-- ==================================================================
-- STEP 2 of 6: 20260530001000_create_recordwatch_notifications.sql
-- ==================================================================
-- RecordWatch reminder, eligibility, notification, preferences, and job-run support.
-- Run after the base profiles/cases migration.

create table if not exists public.recordwatch_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  notification_email text,
  notification_phone text,
  notify_email boolean not null default true,
  notify_sms boolean not null default false,
  plan_type text not null default 'free' check (plan_type in ('free', 'premium')),
  premium_active boolean not null default false,
  premium_started_at timestamptz,
  premium_expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.recordwatch_eligibility_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  eligibility_date date not null,
  eligibility_reason text,
  waiting_period text,
  eligibility_confidence text not null default 'medium' check (eligibility_confidence in ('high', 'medium', 'needs_review')),
  eligibility_confidence_reason text,
  reminder_90_sent boolean not null default false,
  reminder_30_sent boolean not null default false,
  reminder_7_sent boolean not null default false,
  reminder_day_sent boolean not null default false,
  eligibility_notification_sent boolean not null default false,
  eligibility_completed_at timestamptz,
  record_details_completed_at timestamptz,
  paid_at timestamptz,
  packet_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recordwatch_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  type text not null check (type in (
    'eligibility_90_day',
    'eligibility_30_day',
    'eligibility_7_day',
    'eligibility_reached',
    'packet_incomplete_3_day',
    'packet_incomplete_7_day',
    'packet_incomplete_14_day',
    'court_status_received',
    'court_status_under_review',
    'court_status_correction_requested',
    'court_status_accepted',
    'court_status_filed',
    'court_status_hearing_scheduled',
    'court_status_granted',
    'court_status_denied',
    'court_status_closed'
  )),
  channel text not null check (channel in ('email', 'sms', 'in_app')),
  subject text,
  message text not null,
  source text not null default 'system_test',
  notification_date text,
  error_message text,
  sent_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'logged', 'skipped', 'skipped_provider_missing'))
);

create table if not exists public.user_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  eligibility_email boolean not null default true,
  eligibility_sms boolean not null default false,
  court_status_updates boolean not null default true,
  packet_reminders boolean not null default true,
  marketing_emails boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recordwatch_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  processed_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text
);

create unique index if not exists recordwatch_subscriptions_user_case_idx on public.recordwatch_subscriptions(user_id, case_id);
create unique index if not exists recordwatch_eligibility_events_user_case_idx on public.recordwatch_eligibility_events(user_id, case_id);
create index if not exists recordwatch_eligibility_events_due_idx on public.recordwatch_eligibility_events(eligibility_date);
create index if not exists recordwatch_notifications_user_case_idx on public.recordwatch_notifications(user_id, case_id, sent_at desc);
create unique index if not exists recordwatch_notifications_unique_reminder_idx on public.recordwatch_notifications(user_id, case_id, type, notification_date, channel) where notification_date is not null;
create index if not exists recordwatch_job_runs_started_idx on public.recordwatch_job_runs(started_at desc);

alter table public.recordwatch_subscriptions enable row level security;
alter table public.recordwatch_eligibility_events enable row level security;
alter table public.recordwatch_notifications enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.recordwatch_job_runs enable row level security;

drop policy if exists "RecordWatch subscriptions readable by owner" on public.recordwatch_subscriptions;
create policy "RecordWatch subscriptions readable by owner" on public.recordwatch_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "RecordWatch subscriptions inserted by owner" on public.recordwatch_subscriptions;
create policy "RecordWatch subscriptions inserted by owner" on public.recordwatch_subscriptions for insert with check (auth.uid() = user_id);
drop policy if exists "RecordWatch subscriptions updated by owner" on public.recordwatch_subscriptions;
create policy "RecordWatch subscriptions updated by owner" on public.recordwatch_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RecordWatch events readable by owner" on public.recordwatch_eligibility_events;
create policy "RecordWatch events readable by owner" on public.recordwatch_eligibility_events for select using (auth.uid() = user_id);
drop policy if exists "RecordWatch events inserted by owner" on public.recordwatch_eligibility_events;
create policy "RecordWatch events inserted by owner" on public.recordwatch_eligibility_events for insert with check (auth.uid() = user_id);
drop policy if exists "RecordWatch events updated by owner" on public.recordwatch_eligibility_events;
create policy "RecordWatch events updated by owner" on public.recordwatch_eligibility_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RecordWatch notifications readable by owner" on public.recordwatch_notifications;
create policy "RecordWatch notifications readable by owner" on public.recordwatch_notifications for select using (auth.uid() = user_id);
drop policy if exists "RecordWatch notifications inserted by owner" on public.recordwatch_notifications;
create policy "RecordWatch notifications inserted by owner" on public.recordwatch_notifications for insert with check (auth.uid() = user_id);

drop policy if exists "Notification preferences readable by owner" on public.user_notification_preferences;
create policy "Notification preferences readable by owner" on public.user_notification_preferences for select using (auth.uid() = user_id);
drop policy if exists "Notification preferences inserted by owner" on public.user_notification_preferences;
create policy "Notification preferences inserted by owner" on public.user_notification_preferences for insert with check (auth.uid() = user_id);
drop policy if exists "Notification preferences updated by owner" on public.user_notification_preferences;
create policy "Notification preferences updated by owner" on public.user_notification_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Safe upgrades for environments that ran an earlier RecordWatch draft migration.
alter table public.recordwatch_subscriptions add column if not exists plan_type text not null default 'free';
alter table public.recordwatch_subscriptions add column if not exists premium_active boolean not null default false;
alter table public.recordwatch_subscriptions add column if not exists premium_started_at timestamptz;
alter table public.recordwatch_subscriptions add column if not exists premium_expires_at timestamptz;

alter table public.recordwatch_eligibility_events add column if not exists eligibility_confidence text not null default 'medium';
alter table public.recordwatch_eligibility_events add column if not exists eligibility_confidence_reason text;
alter table public.recordwatch_eligibility_events add column if not exists eligibility_completed_at timestamptz;
alter table public.recordwatch_eligibility_events add column if not exists record_details_completed_at timestamptz;
alter table public.recordwatch_eligibility_events add column if not exists paid_at timestamptz;
alter table public.recordwatch_eligibility_events add column if not exists packet_generated_at timestamptz;

alter table public.recordwatch_notifications add column if not exists source text not null default 'system_test';
alter table public.recordwatch_notifications add column if not exists notification_date text;
alter table public.recordwatch_notifications add column if not exists error_message text;
alter table public.recordwatch_notifications drop constraint if exists recordwatch_notifications_type_check;
alter table public.recordwatch_notifications add constraint recordwatch_notifications_type_check check (type in (
  'eligibility_90_day', 'eligibility_30_day', 'eligibility_7_day', 'eligibility_reached',
  'packet_incomplete_3_day', 'packet_incomplete_7_day', 'packet_incomplete_14_day',
  'court_status_received', 'court_status_under_review', 'court_status_correction_requested',
  'court_status_accepted', 'court_status_filed', 'court_status_hearing_scheduled',
  'court_status_granted', 'court_status_denied', 'court_status_closed'
));
alter table public.recordwatch_notifications drop constraint if exists recordwatch_notifications_status_check;
alter table public.recordwatch_notifications add constraint recordwatch_notifications_status_check check (status in ('queued', 'sent', 'failed', 'logged', 'skipped', 'skipped_provider_missing'));

-- ==================================================================
-- STEP 3 of 6: 20260530010000_create_user_ledger_entries.sql
-- ==================================================================
create table if not exists public.user_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text null,
  entry_type text not null,
  description text not null,
  amount_cents integer not null,
  currency text default 'usd',
  debit_cents integer default 0,
  credit_cents integer default 0,
  balance_after_cents integer null,
  stripe_session_id text null,
  stripe_payment_intent_id text null,
  stripe_customer_id text null,
  related_recordwatch_subscription_id uuid null,
  related_packet_id text null,
  status text default 'posted',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint user_ledger_entries_entry_type_check check (entry_type in ('packet_purchase', 'recordwatch_subscription', 'credit', 'refund', 'adjustment', 'recordwatch_activity')),
  constraint user_ledger_entries_status_check check (status in ('posted', 'pending', 'refunded', 'reversed', 'failed')),
  constraint user_ledger_entries_amount_nonnegative_check check (amount_cents >= 0),
  constraint user_ledger_entries_debit_nonnegative_check check (debit_cents >= 0),
  constraint user_ledger_entries_credit_nonnegative_check check (credit_cents >= 0),
  constraint user_ledger_entries_debit_or_credit_check check (debit_cents > 0 or credit_cents > 0 or amount_cents = 0)
);

alter table public.user_ledger_entries enable row level security;

create policy "Users can read their own ledger entries"
  on public.user_ledger_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can view all ledger entries"
  on public.user_ledger_entries
  for select
  to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));

-- No insert/update/delete policies are created for authenticated or anonymous users.
-- Server-side code must use the service role key to write ledger rows.

create index if not exists user_ledger_entries_user_id_idx on public.user_ledger_entries (user_id);
create index if not exists user_ledger_entries_case_id_idx on public.user_ledger_entries (case_id);
create index if not exists user_ledger_entries_created_at_idx on public.user_ledger_entries (created_at desc);
create index if not exists user_ledger_entries_stripe_session_id_idx on public.user_ledger_entries (stripe_session_id);
create index if not exists user_ledger_entries_entry_type_idx on public.user_ledger_entries (entry_type);

create unique index if not exists user_ledger_entries_user_stripe_session_unique_idx
  on public.user_ledger_entries (user_id, stripe_session_id)
  where stripe_session_id is not null;

create unique index if not exists user_ledger_entries_user_idempotency_unique_idx
  on public.user_ledger_entries (user_id, (metadata ->> 'idempotency_key'))
  where metadata ? 'idempotency_key' and nullif(metadata ->> 'idempotency_key', '') is not null;

-- ==================================================================
-- STEP 4 of 6: 20260531000000_saved_cases_source_of_truth.sql
-- ==================================================================
-- Make Supabase the source of truth for account saved case data.

create extension if not exists "pgcrypto";

create table if not exists public.saved_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_number text,
  case_state text,
  county text,
  court_name text,
  court_type text,
  court_id text,
  rule_set_id text,
  local_profile_id text,
  relief_type text,
  primary_charge text,
  offense_code text,
  offense_level text,
  outcome text,
  arrest_date date,
  offense_date date,
  disposition_date date,
  sentence_completion_date date,
  probation_completed_date date,
  discharge_date date,
  final_discharge_date date,
  eligibility_status text,
  eligibility_date date,
  eligibility_confidence text,
  eligibility_reasons jsonb not null default '[]'::jsonb,
  required_waiting_period text,
  date_used_for_calculation date,
  packet_status text not null default 'not_generated',
  packet_generated_at timestamptz,
  packet_paid_at timestamptz,
  recordwatch_status text not null default 'not_activated',
  recordwatch_paused_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.saved_cases(id) on delete cascade,
  charge_name text,
  offense_code text,
  offense_level text,
  offense_date date,
  charge_notes text,
  flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.saved_cases(id) on delete cascade,
  event_type text not null,
  event_status text,
  event_date timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists saved_cases_user_id_idx on public.saved_cases(user_id);
create index if not exists saved_cases_user_active_idx on public.saved_cases(user_id, updated_at desc) where deleted_at is null;
create unique index if not exists saved_cases_user_composite_active_idx
  on public.saved_cases(user_id, lower(coalesce(case_number, '')), lower(coalesce(court_name, '')), lower(coalesce(county, '')), lower(coalesce(case_state, '')))
  where deleted_at is null and case_number is not null and case_number <> '';
create index if not exists case_charges_user_case_idx on public.case_charges(user_id, case_id);
create index if not exists case_events_user_case_idx on public.case_events(user_id, case_id, event_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_saved_cases_updated_at on public.saved_cases;
create trigger set_saved_cases_updated_at
  before update on public.saved_cases
  for each row execute function public.set_updated_at();

drop trigger if exists set_case_charges_updated_at on public.case_charges;
create trigger set_case_charges_updated_at
  before update on public.case_charges
  for each row execute function public.set_updated_at();

alter table public.saved_cases enable row level security;
alter table public.case_charges enable row level security;
alter table public.case_events enable row level security;

-- saved_cases owner-only policies. Service-role clients bypass RLS for administrative workflows.
drop policy if exists "Saved cases are readable by owner" on public.saved_cases;
create policy "Saved cases are readable by owner" on public.saved_cases
  for select using (auth.uid() = user_id);

drop policy if exists "Saved cases are inserted by owner" on public.saved_cases;
create policy "Saved cases are inserted by owner" on public.saved_cases
  for insert with check (auth.uid() = user_id);

drop policy if exists "Saved cases are updated by owner" on public.saved_cases;
create policy "Saved cases are updated by owner" on public.saved_cases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Avoid frontend hard deletes for saved cases; clients should soft-delete with deleted_at/archived_at.
drop policy if exists "Saved cases hard delete denied" on public.saved_cases;
create policy "Saved cases hard delete denied" on public.saved_cases
  for delete using (false);

-- case_charges owner-only policies, tied to the same authenticated user_id.
drop policy if exists "Case charges are readable by owner" on public.case_charges;
create policy "Case charges are readable by owner" on public.case_charges
  for select using (auth.uid() = user_id);

drop policy if exists "Case charges are inserted by owner" on public.case_charges;
create policy "Case charges are inserted by owner" on public.case_charges
  for insert with check (auth.uid() = user_id);

drop policy if exists "Case charges are updated by owner" on public.case_charges;
create policy "Case charges are updated by owner" on public.case_charges
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Case charges are deleted by owner" on public.case_charges;
create policy "Case charges are deleted by owner" on public.case_charges
  for delete using (auth.uid() = user_id);

-- case_events owner-only policies. Events are append-only for authenticated users.
drop policy if exists "Case events are readable by owner" on public.case_events;
create policy "Case events are readable by owner" on public.case_events
  for select using (auth.uid() = user_id);

drop policy if exists "Case events are inserted by owner" on public.case_events;
create policy "Case events are inserted by owner" on public.case_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "Case events are updated by owner" on public.case_events;
create policy "Case events are updated by owner" on public.case_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Case events hard delete denied" on public.case_events;
create policy "Case events hard delete denied" on public.case_events
  for delete using (false);

-- ==================================================================
-- STEP 5 of 6: 20260531010000_premium_recordwatch.sql
-- ==================================================================
-- Premium RecordWatch billing, notification preferences, and reminder schedule support.
-- Saved case data remains in public.saved_cases; these tables only reference saved_cases.id
-- and store subscription/preference/reminder metadata.

create extension if not exists "pgcrypto";

-- Upgrade the earlier free RecordWatch subscription draft into a billing-focused table.
alter table if exists public.recordwatch_subscriptions drop constraint if exists recordwatch_subscriptions_case_id_fkey;
alter table if exists public.recordwatch_subscriptions alter column case_id drop not null;
alter table if exists public.recordwatch_subscriptions alter column case_id type text using case_id::text;
alter table if exists public.recordwatch_subscriptions add column if not exists plan text;
alter table if exists public.recordwatch_subscriptions add column if not exists stripe_subscription_id text;
alter table if exists public.recordwatch_subscriptions add column if not exists stripe_customer_id text;
alter table if exists public.recordwatch_subscriptions add column if not exists stripe_session_id text;
alter table if exists public.recordwatch_subscriptions add column if not exists current_period_start timestamptz;
alter table if exists public.recordwatch_subscriptions add column if not exists current_period_end timestamptz;
alter table if exists public.recordwatch_subscriptions add column if not exists cancel_at_period_end boolean default false;
alter table if exists public.recordwatch_subscriptions add column if not exists updated_at timestamptz default now();
alter table if exists public.recordwatch_subscriptions drop constraint if exists recordwatch_subscriptions_status_check;
alter table if exists public.recordwatch_subscriptions drop constraint if exists recordwatch_subscriptions_plan_type_check;

create table if not exists public.recordwatch_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  status text not null,
  stripe_subscription_id text,
  stripe_customer_id text,
  stripe_session_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

update public.recordwatch_subscriptions
set plan = coalesce(plan, plan_type, 'free'),
    status = coalesce(status, case when premium_active then 'active' else 'inactive' end),
    current_period_start = coalesce(current_period_start, premium_started_at),
    current_period_end = coalesce(current_period_end, premium_expires_at),
    updated_at = coalesce(updated_at, now())
where plan is null or status is null or updated_at is null;

alter table public.recordwatch_subscriptions alter column plan set not null;
alter table public.recordwatch_subscriptions alter column status set not null;
alter table public.recordwatch_subscriptions alter column created_at set default now();
alter table public.recordwatch_subscriptions alter column updated_at set default now();
alter table public.recordwatch_subscriptions add constraint recordwatch_subscriptions_status_check check (status in ('active', 'trialing', 'paid', 'past_due', 'canceled', 'cancelled', 'incomplete', 'inactive', 'paused'));
alter table public.recordwatch_subscriptions add constraint recordwatch_subscriptions_plan_check check (plan in ('monthly', 'annual', 'addon_12_month', 'free', 'premium'));

create table if not exists public.recordwatch_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_case_id uuid references public.saved_cases(id) on delete cascade,
  case_id text,
  email_enabled boolean default true,
  sms_enabled boolean default false,
  phone_number text,
  sms_consent_at timestamptz,
  sms_opted_out_at timestamptz,
  reminder_180_enabled boolean default true,
  reminder_90_enabled boolean default true,
  reminder_30_enabled boolean default true,
  reminder_7_enabled boolean default true,
  reminder_day_enabled boolean default true,
  court_status_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.recordwatch_reminder_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_case_id uuid references public.saved_cases(id) on delete cascade,
  case_id text,
  reminder_type text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  channel text not null,
  status text default 'scheduled',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.recordwatch_subscriptions enable row level security;
alter table public.recordwatch_notification_preferences enable row level security;
alter table public.recordwatch_reminder_events enable row level security;

create index if not exists recordwatch_subscriptions_user_status_idx on public.recordwatch_subscriptions (user_id, status, current_period_end desc);
create index if not exists recordwatch_subscriptions_stripe_session_idx on public.recordwatch_subscriptions (stripe_session_id);
create index if not exists recordwatch_subscriptions_stripe_subscription_idx on public.recordwatch_subscriptions (stripe_subscription_id);
create unique index if not exists recordwatch_subscriptions_user_stripe_session_unique_idx
  on public.recordwatch_subscriptions (user_id, stripe_session_id)
  where stripe_session_id is not null;
create unique index if not exists recordwatch_subscriptions_user_stripe_subscription_unique_idx
  on public.recordwatch_subscriptions (user_id, stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists recordwatch_notification_preferences_user_idx on public.recordwatch_notification_preferences (user_id);
create unique index if not exists recordwatch_notification_preferences_user_saved_case_idx
  on public.recordwatch_notification_preferences (user_id, saved_case_id)
  where saved_case_id is not null;
create unique index if not exists recordwatch_notification_preferences_user_global_idx
  on public.recordwatch_notification_preferences (user_id)
  where saved_case_id is null and case_id is null;

create index if not exists recordwatch_reminder_events_user_schedule_idx on public.recordwatch_reminder_events (user_id, scheduled_for desc);
create unique index if not exists recordwatch_reminder_events_unique_schedule_idx
  on public.recordwatch_reminder_events (user_id, coalesce(saved_case_id::text, case_id, ''), reminder_type, channel, scheduled_for);

-- Replace owner-writable subscription policies from the free draft. Clients may read only;
-- the server/service role writes billing status so users cannot forge premium access.
drop policy if exists "RecordWatch subscriptions readable by owner" on public.recordwatch_subscriptions;
drop policy if exists "RecordWatch subscriptions inserted by owner" on public.recordwatch_subscriptions;
drop policy if exists "RecordWatch subscriptions updated by owner" on public.recordwatch_subscriptions;
create policy "RecordWatch subscriptions readable by owner"
  on public.recordwatch_subscriptions for select using (auth.uid() = user_id);

create policy "RecordWatch preferences readable by owner"
  on public.recordwatch_notification_preferences for select using (auth.uid() = user_id);
create policy "RecordWatch preferences inserted by owner"
  on public.recordwatch_notification_preferences for insert with check (auth.uid() = user_id);
create policy "RecordWatch preferences updated by owner"
  on public.recordwatch_notification_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "RecordWatch reminder events readable by owner"
  on public.recordwatch_reminder_events for select using (auth.uid() = user_id);

-- Service-role clients bypass RLS and are responsible for subscription writes and sent-event updates.

-- Extend the ledger entry vocabulary for Premium RecordWatch without recreating ledger data.
alter table if exists public.user_ledger_entries drop constraint if exists user_ledger_entries_entry_type_check;
alter table if exists public.user_ledger_entries add constraint user_ledger_entries_entry_type_check check (entry_type in (
  'packet_purchase',
  'recordwatch_subscription',
  'recordwatch_addon',
  'recordwatch_refund',
  'recordwatch_credit',
  'credit',
  'refund',
  'adjustment',
  'recordwatch_activity'
));

drop trigger if exists set_recordwatch_subscriptions_updated_at on public.recordwatch_subscriptions;
create trigger set_recordwatch_subscriptions_updated_at
  before update on public.recordwatch_subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists set_recordwatch_notification_preferences_updated_at on public.recordwatch_notification_preferences;
create trigger set_recordwatch_notification_preferences_updated_at
  before update on public.recordwatch_notification_preferences
  for each row execute function public.set_updated_at();

alter table if exists public.recordwatch_notifications drop constraint if exists recordwatch_notifications_type_check;
alter table if exists public.recordwatch_notifications add constraint recordwatch_notifications_type_check check (type in (
  'eligibility_180_day',
  'eligibility_90_day',
  'eligibility_30_day',
  'eligibility_7_day',
  'eligibility_reached',
  'packet_incomplete_3_day',
  'packet_incomplete_7_day',
  'packet_incomplete_14_day',
  'court_status_received',
  'court_status_under_review',
  'court_status_correction_requested',
  'court_status_accepted',
  'court_status_filed',
  'court_status_hearing_scheduled',
  'court_status_granted',
  'court_status_denied',
  'court_status_closed'
));

-- ==================================================================
-- STEP 6 of 6: 20261108010000_recordwatch_stripe_entitlements.sql
-- ==================================================================
-- Stripe is the sole authority for RecordWatch paid entitlements.
-- Apply before enabling live subscription checkout.
-- The service-role API writes Stripe status; the browser has read access only.

alter table public.recordwatch_subscriptions
  drop constraint if exists recordwatch_subscriptions_status_check;
alter table public.recordwatch_subscriptions
  add constraint recordwatch_subscriptions_status_check
  check (status in (
    'active','trialing','paid','past_due','unpaid','canceled',
    'cancelled','incomplete','incomplete_expired','inactive','paused'
  ));

-- Any prior owner write policy, including the free enrollment draft, is
-- unsuitable for a billing table. Free enrollment uses the server endpoint.
drop policy if exists "RecordWatch subscriptions inserted by owner" on public.recordwatch_subscriptions;
drop policy if exists "RecordWatch subscriptions updated by owner" on public.recordwatch_subscriptions;
revoke insert, update, delete on public.recordwatch_subscriptions from anon, authenticated;
grant select on public.recordwatch_subscriptions to authenticated;

-- A Stripe subscription may never be linked to two different users.
create unique index if not exists recordwatch_stripe_subscription_id_global_unique_idx
  on public.recordwatch_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Existing legacy premium flags with no Stripe evidence must not unlock SMS.
update public.recordwatch_subscriptions
set premium_active=false, plan_type='free'
where stripe_subscription_id is null
  and (premium_active=true or plan_type='premium');

comment on table public.recordwatch_subscriptions is
  'Stripe-verified RecordWatch subscription snapshots; clients are read-only.';

-- Migration receipt: only the privileged server can read it. Checkout checks
-- for this after the entire billing-security migration succeeds.
create table if not exists public.recordwatch_billing_migration_receipts (
  id text primary key,
  applied_at timestamptz not null default now()
);
alter table public.recordwatch_billing_migration_receipts enable row level security;
revoke all on public.recordwatch_billing_migration_receipts from public, anon, authenticated;
grant select on public.recordwatch_billing_migration_receipts to service_role;
insert into public.recordwatch_billing_migration_receipts (id)
values ('20261108010000_recordwatch_stripe_entitlements')
on conflict (id) do nothing;

COMMIT;

-- Read-only post-install checks (successful fields return table names).
SELECT
  to_regclass('public.cases') AS cases,
  to_regclass('public.saved_cases') AS saved_cases,
  to_regclass('public.user_ledger_entries') AS ledger,
  to_regclass('public.recordwatch_subscriptions') AS recordwatch_subscriptions,
  to_regclass('public.recordwatch_notification_preferences') AS premium_preferences,
  to_regclass('public.recordwatch_billing_migration_receipts') AS migration_receipts;

SELECT id, applied_at
FROM public.recordwatch_billing_migration_receipts
WHERE id='20261108010000_recordwatch_stripe_entitlements';
