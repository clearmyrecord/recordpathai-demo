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
