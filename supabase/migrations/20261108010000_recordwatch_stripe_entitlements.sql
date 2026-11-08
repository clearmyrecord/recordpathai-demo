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
