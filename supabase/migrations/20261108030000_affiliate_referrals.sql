-- Affiliate program v1. Approval-only; no automatic bank or Stripe Connect payout.
-- Apply only after an owner reviews partner compliance, and before AFFILIATE_PROGRAM_ENABLED=true.
-- Does not modify existing RecordWatch entitlements, checkout price, or court fee tables.
create table if not exists public.affiliate_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,24}$'),
  display_name text not null check (char_length(display_name) between 2 and 120),
  partner_type text not null check (partner_type in ('creator','publisher','community_business','nonprofit','other')),
  website text,
  audience_description text,
  status text not null default 'pending' check (status in ('pending','approved','suspended','rejected')),
  commission_bps integer not null default 2000 check (commission_bps between 0 and 3000),
  compliance_approved_at timestamptz,
  disclosures_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists affiliate_partners_status_idx on public.affiliate_partners(status,created_at);
create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.affiliate_partners(id) on delete restrict,
  referred_user_id uuid not null unique references auth.users(id) on delete restrict,
  attributed_at timestamptz not null default now(),
  source text not null default 'partner_link',
  check (source = 'partner_link')
);
create index if not exists affiliate_referrals_partner_idx on public.affiliate_referrals(partner_id,attributed_at);
create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.affiliate_partners(id) on delete restrict,
  referral_id uuid not null references public.affiliate_referrals(id) on delete restrict,
  stripe_checkout_session_id text not null unique check (stripe_checkout_session_id like 'cs_%'),
  stripe_payment_intent_id text not null check (stripe_payment_intent_id like 'pi_%'),
  product text not null check (product in ('recordwatch_lifetime','packet_preparation')),
  service_fee_cents integer not null check (service_fee_cents in (3900,5000)),
  commission_bps integer not null check (commission_bps between 0 and 3000),
  commission_cents integer not null check (commission_cents between 0 and 1500),
  currency text not null default 'usd' check (currency = 'usd'),
  status text not null default 'pending' check (status in ('pending','approved','paid','void')),
  earned_at timestamptz not null,
  available_after timestamptz not null,
  voided_at timestamptz,
  void_reason text check (void_reason is null or void_reason in ('refund','dispute','fraud','manual_review')),
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'void' and voided_at is not null) or (status <> 'void' and voided_at is null))
);
create index if not exists affiliate_commissions_partner_idx on public.affiliate_commissions(partner_id,status,available_after);
create index if not exists affiliate_commissions_intent_idx on public.affiliate_commissions(stripe_payment_intent_id);
create table if not exists public.affiliate_program_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);
alter table public.affiliate_partners enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_program_migrations enable row level security;
-- Private payouts and referral identities are service-role only; no direct authenticated table reads.
revoke all on public.affiliate_partners,public.affiliate_referrals,public.affiliate_commissions,public.affiliate_program_migrations from public,anon,authenticated;
grant all on public.affiliate_partners,public.affiliate_referrals,public.affiliate_commissions,public.affiliate_program_migrations to service_role;
comment on table public.affiliate_commissions is
  'Verified paid RecordPathAI platform-service commissions only. No court fee, case facts, applicant names or payout banking data. Manual payout reviews required.';
insert into public.affiliate_program_migrations(id)
values ('20261108030000_affiliate_referrals')
on conflict(id) do nothing;
