-- Affiliate payout ledger v2: deploy AFTER 20261108030000_affiliate_referrals.sql.
-- Fail closed. The database only reserves reviewed commissions; Stripe sends funds separately.
-- Do NOT store bank numbers, tax IDs, criminal records, or referral customer details.
alter table public.affiliate_partners
  add column if not exists stripe_recipient_account_id text unique,
  add column if not exists payout_entity_type text check (payout_entity_type in ('individual','company')),
  add column if not exists payout_onboarding_started_at timestamptz,
  add column if not exists tax_reviewed_at timestamptz,
  add column if not exists payouts_paused boolean not null default true;
alter table public.affiliate_partners
  drop constraint if exists affiliate_recipient_account_id_format;
alter table public.affiliate_partners
  add constraint affiliate_recipient_account_id_format check (
    stripe_recipient_account_id is null or stripe_recipient_account_id ~ '^acct_(test_)?[a-zA-Z0-9]+$'
  );
create table if not exists public.affiliate_payout_batches (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.affiliate_partners(id) on delete restrict,
  currency text not null default 'usd' check(currency='usd'),
  amount_cents bigint not null check(amount_cents >= 5000 and amount_cents <= 10000000),
  stripe_recipient_account_id text not null check(stripe_recipient_account_id ~ '^acct_(test_)?[a-zA-Z0-9]+$'),
  stripe_payout_intent_id text unique check(stripe_payout_intent_id is null or stripe_payout_intent_id ~ '^poi_(test_)?[a-zA-Z0-9]+$'),
  status text not null default 'reserved' check(status in
    ('reserved','requires_confirmation','submitted','processing','paid','failed','returned','canceled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  confirmed_at timestamptz,
  stripe_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists affiliate_one_open_payout_per_partner
  on public.affiliate_payout_batches(partner_id)
  where status in ('reserved','requires_confirmation','submitted','processing');
create index if not exists affiliate_payout_batches_partner_idx
  on public.affiliate_payout_batches(partner_id,created_at desc);
alter table public.affiliate_commissions
  add column if not exists payout_batch_id uuid references public.affiliate_payout_batches(id) on delete restrict;
create index if not exists affiliate_commissions_batch_idx
  on public.affiliate_commissions(payout_batch_id);
alter table public.affiliate_payout_batches enable row level security;
revoke all on public.affiliate_payout_batches from public,anon,authenticated;
grant all on public.affiliate_payout_batches to service_role;

-- Atomically claims only approved commissions whose 30-day hold has expired.
-- This is service_role-only; no public or partner can select or mark payouts as paid.
create or replace function public.reserve_affiliate_payout_batch(p_partner_id uuid)
returns public.affiliate_payout_batches
language plpgsql security definer set search_path=public
as $$
declare
  p public.affiliate_partners%rowtype;
  batch public.affiliate_payout_batches%rowtype;
  commission_ids uuid[];
  total_cents bigint;
begin
  select * into p from public.affiliate_partners where id=p_partner_id for update;
  if not found or p.status <> 'approved' or p.compliance_approved_at is null
     or p.tax_reviewed_at is null or p.payouts_paused
     or p.stripe_recipient_account_id is null then
    raise exception 'Affiliate payout prerequisites have not been approved';
  end if;
  select * into batch from public.affiliate_payout_batches
    where partner_id=p_partner_id and status in ('reserved','requires_confirmation','submitted','processing')
    order by created_at desc limit 1 for update;
  if found then return batch; end if;
  select array_agg(id),coalesce(sum(commission_cents),0) into commission_ids,total_cents
  from (
    select id,commission_cents from public.affiliate_commissions
    where partner_id=p_partner_id and status='approved'
      and payout_batch_id is null and available_after <= now()
    order by id for update
  ) eligible;
  if total_cents < 5000 or total_cents > 10000000 then
    raise exception 'Affiliate commission amount below minimum or above payout review limit';
  end if;
  insert into public.affiliate_payout_batches
    (partner_id,amount_cents,stripe_recipient_account_id,status)
    values (p_partner_id,total_cents,p.stripe_recipient_account_id,'reserved')
    returning * into batch;
  update public.affiliate_commissions
    set payout_batch_id=batch.id where id=any(commission_ids)
      and payout_batch_id is null and status='approved';
  return batch;
end;
$$;
revoke all on function public.reserve_affiliate_payout_batch(uuid) from public,anon,authenticated;
grant execute on function public.reserve_affiliate_payout_batch(uuid) to service_role;
insert into public.affiliate_program_migrations(id)
values('20261109030000_affiliate_payouts')
on conflict(id) do nothing;
