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
