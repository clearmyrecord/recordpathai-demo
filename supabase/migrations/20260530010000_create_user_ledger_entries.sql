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
