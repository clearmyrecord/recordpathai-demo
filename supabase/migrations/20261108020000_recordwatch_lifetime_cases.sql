-- RecordWatch Premium: $39 once per saved filing/case. No recurring charge.
-- Keep earlier Stripe subscription history intact. Do not run the full bootstrap.
-- Apply AFTER 20261108010000_recordwatch_stripe_entitlements.sql.
create table if not exists public.recordwatch_lifetime_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_case_id uuid not null references public.saved_cases(id) on delete restrict,
  plan text not null default 'lifetime_case' check (plan = 'lifetime_case'),
  status text not null check (status in ('active','refunded','disputed')),
  amount_cents integer not null check (amount_cents = 3900),
  currency text not null check (currency = 'usd'),
  stripe_checkout_session_id text not null unique check (stripe_checkout_session_id like 'cs_%'),
  stripe_payment_intent_id text not null unique check (stripe_payment_intent_id like 'pi_%'),
  stripe_customer_id text,
  purchased_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, saved_case_id),
  check ((status = 'active' and revoked_at is null) or status <> 'active')
);
create index if not exists recordwatch_lifetime_cases_user_idx
  on public.recordwatch_lifetime_cases(user_id,saved_case_id);
alter table public.recordwatch_lifetime_cases enable row level security;
drop policy if exists "RecordWatch lifetime case entitlement read by owner" on public.recordwatch_lifetime_cases;
create policy "RecordWatch lifetime case entitlement read by owner"
  on public.recordwatch_lifetime_cases for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.recordwatch_lifetime_cases from public, anon, authenticated;
grant select on public.recordwatch_lifetime_cases to authenticated;
grant all on public.recordwatch_lifetime_cases to service_role;
comment on table public.recordwatch_lifetime_cases is
  'Server-only Stripe-confirmed USD $39 lifetime RecordWatch entitlement for exactly one saved case; no account-wide premium.';
insert into public.recordwatch_billing_migration_receipts(id)
values ('20261108020000_recordwatch_lifetime_cases')
on conflict(id) do nothing;
