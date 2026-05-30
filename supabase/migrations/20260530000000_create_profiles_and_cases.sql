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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name','')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

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
