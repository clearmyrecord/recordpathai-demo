-- Professional conviction mail orders are separate from consumer packet orders.
-- Service-only table: no browser access or approval. One filing per case until operator reconciliation.
begin;
create table if not exists public.professional_mail_orders (
 case_id uuid primary key references public.professional_cases(id) on delete restrict,
 org_id uuid not null references public.professional_pilot_orgs(id),
 user_id uuid not null references auth.users(id),
 document_id uuid not null references public.professional_signed_documents(id) on delete restrict,
 signed_sha text not null check(signed_sha ~ '^[a-f0-9]{64}$'),
 reviewer_reference text not null check(length(trim(reviewer_reference)) between 12 and 500),
 reviewed_at timestamptz not null default now(),
 status text not null default 'approved' check(status in ('approved','paid_hold','dispatch_claimed','submitted_to_lob')),
 stripe_session_id text unique check(stripe_session_id ~ '^cs_live_[A-Za-z0-9]+$'),
 stripe_event_id text unique check(stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
 attempted_at timestamptz,
 lob_check_id text unique check(lob_check_id ~ '^chk_[A-Za-z0-9]+$'),
 created_at timestamptz not null default now(),
 check((status='approved') or (stripe_session_id is not null and stripe_event_id is not null)),
 check((status not in ('dispatch_claimed','submitted_to_lob')) or attempted_at is not null),
 check(status<>'submitted_to_lob' or lob_check_id is not null)
);
alter table public.professional_mail_orders enable row level security;
revoke all on public.professional_mail_orders from public, anon, authenticated;
grant select,insert,update on public.professional_mail_orders to service_role;
commit;
