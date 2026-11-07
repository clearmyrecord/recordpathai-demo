-- Prepared private, opt-in source index for authorized court exports only.
-- NOT automatically applied; requires Supabase administrator review and execution.
-- Public and signed-in browser users are denied access to these raw tables.
-- Existing saved_cases and user-owned records are not changed.

create extension if not exists pgcrypto;

create table if not exists public.court_source_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  issuing_agency text not null,
  jurisdiction_state text not null check (jurisdiction_state in ('OH','NV','TX','FL','AZ','GA')),
  county_fips text not null check (county_fips ~ '^[0-9]{5}$'),
  official_source_url text not null check (official_source_url ~ '^https://'),
  file_received_at timestamptz,
  data_as_of date,
  access_authority_reference text not null,
  authorized_by text not null,
  status text not null default 'quarantined' check (status in ('quarantined','under_review','approved_for_internal_matching','revoked')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  notes text not null default ''
);

create table if not exists public.court_source_case_versions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.court_source_import_batches(id) on delete restrict,
  source_case_key text not null,
  state text not null check (state in ('OH','NV','TX','FL','AZ','GA')),
  county_fips text not null check (county_fips ~ '^[0-9]{5}$'),
  court_name text not null,
  case_number text not null,
  defendant_name text not null,
  source_last_updated_at timestamptz,
  source_url text,
  record_completeness text not null default 'unknown' check
    (record_completeness in ('unknown','partial','verified_complete')),
  docket_review_status text not null default 'needs_review' check
    (docket_review_status in ('needs_review','reviewed','disputed','superseded')),
  clerk_verified_at timestamptz,
  clerk_evidence_reference text,
  created_at timestamptz not null default now(),
  unique (batch_id,source_case_key)
);

create table if not exists public.court_source_charge_versions (
  id uuid primary key default gen_random_uuid(),
  source_case_version_id uuid not null references public.court_source_case_versions(id) on delete restrict,
  source_charge_key text not null,
  original_charge text,
  original_statute text,
  final_charge text,
  final_statute text,
  offense_level text,
  final_disposition text,
  disposition_date date,
  reported_termination_date date,
  verified_supervision_termination_date date,
  termination_evidence_reference text,
  supervision_completion_verified_at timestamptz,
  source_line_reference text,
  created_at timestamptz not null default now(),
  unique (source_case_version_id,source_charge_key),
  constraint verified_termination_requires_evidence check (
    verified_supervision_termination_date is null
    or (nullif(trim(termination_evidence_reference),'') is not null
        and supervision_completion_verified_at is not null)
  )
);

create index if not exists court_source_case_lookup_idx
  on public.court_source_case_versions(state,county_fips,lower(case_number));
create index if not exists court_source_case_name_idx
  on public.court_source_case_versions(state,county_fips,lower(defendant_name));
create index if not exists court_source_charge_version_case_idx
  on public.court_source_charge_versions(source_case_version_id);

alter table public.court_source_import_batches enable row level security;
alter table public.court_source_case_versions enable row level security;
alter table public.court_source_charge_versions enable row level security;
alter table public.court_source_import_batches force row level security;
alter table public.court_source_case_versions force row level security;
alter table public.court_source_charge_versions force row level security;

-- No policies intentionally: even authenticated users must never search all
-- criminal-history records from the browser. Only a controlled service-role
-- process (BYPASSRLS) may review or ingest them after external authorization.
revoke all on public.court_source_import_batches from public, anon, authenticated;
revoke all on public.court_source_case_versions from public, anon, authenticated;
revoke all on public.court_source_charge_versions from public, anon, authenticated;
grant select,insert,update on public.court_source_import_batches to service_role;
grant select,insert,update on public.court_source_case_versions to service_role;
grant select,insert,update on public.court_source_charge_versions to service_role;

-- No publicly callable matching RPC, no direct browser access and no
-- automatic association of a court record with a person or saved_cases.
-- Public lookup requires a separate authenticated and independently verified
-- matching/release policy before deployment.
