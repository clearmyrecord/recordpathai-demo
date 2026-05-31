-- Premium RecordWatch subscriptions, reminder preferences, and scheduled reminder events.

create table if not exists public.recordwatch_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text null,
  plan text not null,
  status text not null,
  stripe_subscription_id text,
  stripe_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.recordwatch_subscriptions add column if not exists case_id text;
alter table public.recordwatch_subscriptions add column if not exists plan_type text not null default 'free';
alter table public.recordwatch_subscriptions add column if not exists premium_active boolean not null default false;
alter table public.recordwatch_subscriptions add column if not exists premium_started_at timestamptz;
alter table public.recordwatch_subscriptions add column if not exists premium_expires_at timestamptz;
alter table public.recordwatch_subscriptions add column if not exists notification_email text;
alter table public.recordwatch_subscriptions add column if not exists notification_phone text;
alter table public.recordwatch_subscriptions add column if not exists notify_email boolean not null default true;
alter table public.recordwatch_subscriptions add column if not exists notify_sms boolean not null default false;
alter table public.recordwatch_subscriptions add column if not exists plan text;
alter table public.recordwatch_subscriptions add column if not exists status text not null default 'active';
alter table public.recordwatch_subscriptions add column if not exists stripe_subscription_id text;
alter table public.recordwatch_subscriptions add column if not exists stripe_customer_id text;
alter table public.recordwatch_subscriptions add column if not exists current_period_start timestamptz;
alter table public.recordwatch_subscriptions add column if not exists current_period_end timestamptz;
alter table public.recordwatch_subscriptions add column if not exists cancel_at_period_end boolean default false;
alter table public.recordwatch_subscriptions add column if not exists updated_at timestamptz default now();
alter table public.recordwatch_subscriptions alter column plan set default 'free';
update public.recordwatch_subscriptions set plan = coalesce(plan, case when premium_active then 'premium' else plan_type end, 'free');
alter table public.recordwatch_subscriptions alter column plan set not null;

create table if not exists public.recordwatch_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text nullable,
  email_enabled boolean default true,
  sms_enabled boolean default false,
  phone_number text nullable,
  sms_consent_at timestamptz nullable,
  sms_opted_out_at timestamptz nullable,
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
  case_id text not null,
  reminder_type text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz nullable,
  channel text not null,
  status text default 'scheduled',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.recordwatch_subscriptions enable row level security;
alter table public.recordwatch_notification_preferences enable row level security;
alter table public.recordwatch_reminder_events enable row level security;

drop policy if exists "RecordWatch subscriptions inserted by owner" on public.recordwatch_subscriptions;
drop policy if exists "RecordWatch subscriptions updated by owner" on public.recordwatch_subscriptions;
drop policy if exists "RecordWatch subscriptions readable by owner" on public.recordwatch_subscriptions;
create policy "RecordWatch subscriptions readable by owner" on public.recordwatch_subscriptions for select to authenticated using (auth.uid() = user_id);
-- Paid subscription status is intentionally writable only by server/service role.

drop policy if exists "RecordWatch preferences readable by owner" on public.recordwatch_notification_preferences;
create policy "RecordWatch preferences readable by owner" on public.recordwatch_notification_preferences for select to authenticated using (auth.uid() = user_id);
drop policy if exists "RecordWatch preferences inserted by owner" on public.recordwatch_notification_preferences;
create policy "RecordWatch preferences inserted by owner" on public.recordwatch_notification_preferences for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "RecordWatch preferences updated by owner" on public.recordwatch_notification_preferences;
create policy "RecordWatch preferences updated by owner" on public.recordwatch_notification_preferences for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RecordWatch reminder events readable by owner" on public.recordwatch_reminder_events;
create policy "RecordWatch reminder events readable by owner" on public.recordwatch_reminder_events for select to authenticated using (auth.uid() = user_id);
-- Reminder events are written by server/service role so browser clients cannot forge sent events.

create index if not exists recordwatch_subscriptions_user_id_idx on public.recordwatch_subscriptions (user_id);
create index if not exists recordwatch_subscriptions_status_idx on public.recordwatch_subscriptions (status);
create unique index if not exists recordwatch_subscriptions_stripe_subscription_unique_idx on public.recordwatch_subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;
create unique index if not exists recordwatch_subscriptions_user_case_text_idx on public.recordwatch_subscriptions (user_id, case_id) where case_id is not null;
create unique index if not exists recordwatch_notification_preferences_user_id_idx on public.recordwatch_notification_preferences (user_id);
create index if not exists recordwatch_reminder_events_user_case_idx on public.recordwatch_reminder_events (user_id, case_id);
create unique index if not exists recordwatch_reminder_events_unique_idx on public.recordwatch_reminder_events (user_id, case_id, reminder_type, scheduled_for, channel);

alter table public.user_ledger_entries drop constraint if exists user_ledger_entries_entry_type_check;
alter table public.user_ledger_entries add constraint user_ledger_entries_entry_type_check check (entry_type in (
  'packet_purchase', 'recordwatch_subscription', 'recordwatch_addon', 'recordwatch_refund', 'recordwatch_credit', 'credit', 'refund', 'adjustment', 'recordwatch_activity'
));
alter table public.user_ledger_entries add column if not exists stripe_subscription_id text null;
create index if not exists user_ledger_entries_stripe_subscription_id_idx on public.user_ledger_entries (stripe_subscription_id);
