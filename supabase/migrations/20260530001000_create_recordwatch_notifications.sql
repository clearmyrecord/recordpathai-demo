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
