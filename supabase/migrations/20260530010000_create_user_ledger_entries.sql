-- RecordPathAI user purchase ledger.
-- Tracks packet purchases, RecordWatch charges, credits, refunds, and future account activity.

create extension if not exists "pgcrypto";

create table if not exists public.user_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text,
  entry_type text not null,
  description text not null,
  amount_cents integer not null,
  currency text default 'usd',
  debit_cents integer default 0,
  credit_cents integer default 0,
  balance_after_cents integer,
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  related_recordwatch_subscription_id uuid,
  related_packet_id text,
  status text default 'posted',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint user_ledger_entries_entry_type_check check (entry_type in (
    'packet_purchase',
    'recordwatch_subscription',
    'sms_alert_charge',
    'credit',
    'refund',
    'adjustment',
    'court_filing_fee',
    'promo_credit',
    'failed_payment',
    'chargeback'
  )),
  constraint user_ledger_entries_status_check check (status in (
    'pending',
    'posted',
    'failed',
    'refunded',
    'reversed'
  )),
  constraint user_ledger_entries_amount_positive_check check (amount_cents > 0),
  constraint user_ledger_entries_debit_positive_check check (debit_cents >= 0),
  constraint user_ledger_entries_credit_positive_check check (credit_cents >= 0),
  constraint user_ledger_entries_single_direction_check check (debit_cents = 0 or credit_cents = 0)
);

create index if not exists user_ledger_entries_user_id_idx on public.user_ledger_entries(user_id);
create index if not exists user_ledger_entries_case_id_idx on public.user_ledger_entries(case_id);
create index if not exists user_ledger_entries_created_at_desc_idx on public.user_ledger_entries(created_at desc);
create index if not exists user_ledger_entries_stripe_session_id_idx on public.user_ledger_entries(stripe_session_id);
create index if not exists user_ledger_entries_entry_type_idx on public.user_ledger_entries(entry_type);

create unique index if not exists user_ledger_entries_user_stripe_session_posted_uidx
  on public.user_ledger_entries(user_id, stripe_session_id)
  where stripe_session_id is not null and status = 'posted';

create unique index if not exists user_ledger_entries_user_metadata_idempotency_posted_uidx
  on public.user_ledger_entries(user_id, (metadata->>'idempotency_key'))
  where metadata ? 'idempotency_key' and status = 'posted';

alter table public.user_ledger_entries enable row level security;

-- Users can read only their own account statement entries.
drop policy if exists "Ledger entries are readable by owner" on public.user_ledger_entries;
create policy "Ledger entries are readable by owner" on public.user_ledger_entries
  for select using (auth.uid() = user_id);

-- Admin JWTs can view all ledger entries. Service-role requests bypass RLS by design.
drop policy if exists "Ledger entries are readable by admins" on public.user_ledger_entries;
create policy "Ledger entries are readable by admins" on public.user_ledger_entries
  for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- No browser insert/update/delete policies are created. Ledger writes happen from trusted server/service-role code.
