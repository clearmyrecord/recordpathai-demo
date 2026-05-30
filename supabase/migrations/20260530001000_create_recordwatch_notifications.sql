-- RecordWatch reminder, eligibility, and notification support.
-- Run after the base profiles/cases migration.

create table if not exists public.recordwatch_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  notification_email text,
  notification_phone text,
  notify_email boolean not null default true,
  notify_sms boolean not null default false,
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
  reminder_90_sent boolean not null default false,
  reminder_30_sent boolean not null default false,
  reminder_7_sent boolean not null default false,
  reminder_day_sent boolean not null default false,
  eligibility_notification_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recordwatch_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  type text not null check (type in ('eligibility_reminder', 'eligibility_reached', 'packet_incomplete', 'court_status_update')),
  channel text not null check (channel in ('email', 'sms', 'in_app')),
  subject text,
  message text not null,
  sent_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'logged', 'skipped'))
);

create unique index if not exists recordwatch_subscriptions_user_case_idx on public.recordwatch_subscriptions(user_id, case_id);
create unique index if not exists recordwatch_eligibility_events_user_case_idx on public.recordwatch_eligibility_events(user_id, case_id);
create index if not exists recordwatch_eligibility_events_due_idx on public.recordwatch_eligibility_events(eligibility_date);
create index if not exists recordwatch_notifications_user_case_idx on public.recordwatch_notifications(user_id, case_id, sent_at desc);

alter table public.recordwatch_subscriptions enable row level security;
alter table public.recordwatch_eligibility_events enable row level security;
alter table public.recordwatch_notifications enable row level security;

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
