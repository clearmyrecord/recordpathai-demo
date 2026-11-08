-- Private, server-enforced release gate for court filings and Stripe collection.
-- Required: apply through the authenticated Supabase admin migration workflow.
-- An applicant must never be able to approve their own filing or fee.
create table if not exists public.packet_releases (
  case_id uuid primary key references public.saved_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'needs_review' check(status in ('needs_review','approved','revoked')),
  form_type text not null check(form_type in ('sealing-conviction','sealing-dismissal')),
  case_snapshot_sha256 text not null check(case_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  signed_pdf_sha256 text not null check(signed_pdf_sha256 ~ '^[a-f0-9]{64}$'),
  signed_pdf_private_path text not null,
  reviewer_id text not null,
  reviewed_at timestamptz not null,
  identity_verified boolean not null default false,
  official_docket_verified boolean not null default false,
  all_charges_verified boolean not null default false,
  final_discharge_verified boolean not null default false,
  statutory_exclusions_reviewed boolean not null default false,
  filing_instructions_verified boolean not null default false,
  exact_court_form_verified boolean not null default false,
  applicant_signature_verified boolean not null default false,
  filing_authorization_verified boolean not null default false,
  accepted_fee_waiver boolean not null default false,
  fee_waiver_evidence text,
  approved_court_fee_cents integer not null check(approved_court_fee_cents>=0 and approved_court_fee_cents<=50000),
  fee_payment_method text not null check(fee_payment_method in ('lob_check','court_online','no_fee')),
  verified_check_payee text,
  verified_filing_address text,
  reviewer_evidence_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists packet_releases_owner_idx on public.packet_releases(user_id);
drop trigger if exists set_packet_releases_updated_at on public.packet_releases;
create trigger set_packet_releases_updated_at
before update on public.packet_releases for each row execute function public.set_updated_at();
alter table public.packet_releases enable row level security;
-- The service role alone may read or write releases; authenticated clients cannot
-- create approvals or change approved fee amounts.
revoke all on public.packet_releases from anon, authenticated;
grant all on public.packet_releases to service_role;
-- Intentionally NO applicant read/update/insert policies.

-- Each execution is irreversible if it reaches Lob, so persist its idempotency
-- and evidence before doing network side effects.
create table if not exists public.packet_fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.saved_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  status text not null default 'paid_hold'
    check(status in ('paid_hold','ready_for_dispatch','submitted_to_lob','manual_filing','delivered','failed','cancelled')),
  court_fee_cents integer not null default 0 check(court_fee_cents>=0),
  payment_method text not null,
  lob_check_id text unique,
  proof_url text,
  attempted_at timestamptz,
  mailed_at timestamptz,
  confirmation_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists packet_fulfillment_jobs_case_session
  on public.packet_fulfillment_jobs(case_id,stripe_session_id);
drop trigger if exists set_packet_fulfillment_jobs_updated_at on public.packet_fulfillment_jobs;
create trigger set_packet_fulfillment_jobs_updated_at
before update on public.packet_fulfillment_jobs for each row execute function public.set_updated_at();
alter table public.packet_fulfillment_jobs enable row level security;
revoke all on public.packet_fulfillment_jobs from anon, authenticated;
grant all on public.packet_fulfillment_jobs to service_role;


-- Private applicant PDF review copies. Owner can request upload through the
-- authenticated application endpoint only; no browser RLS policy is granted.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('packet-documents','packet-documents',false,8388608,array['application/pdf'])
on conflict (id) do update
set public=false,file_size_limit=8388608,allowed_mime_types=array['application/pdf'];

create table if not exists public.packet_drafts (
  case_id uuid primary key references public.saved_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_snapshot_sha256 text not null check(case_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  signed_pdf_sha256 text not null check(signed_pdf_sha256 ~ '^[a-f0-9]{64}$'),
  signed_pdf_private_path text not null unique,
  pdf_pages integer not null check(pdf_pages between 1 and 6),
  created_at timestamptz not null default now()
);
alter table public.packet_drafts enable row level security;
revoke all on public.packet_drafts from anon,authenticated;
grant all on public.packet_drafts to service_role;
