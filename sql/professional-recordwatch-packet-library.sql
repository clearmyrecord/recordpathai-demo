-- RecordWatch generated packet archive: unsigned and review drafts never imply signature or filing.
begin;
create table public.professional_generated_packets(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,case_id uuid not null,attorney_id uuid not null,
 kind text not null check(kind in ('review_draft','unsigned_application')),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 500 and 2097152 and substring(pdf_bytes from 1 for 5)=decode('255044462d','hex') and encode(sha256(pdf_bytes),'hex')=sha256),
 page_count integer not null check(page_count=2),
 created_at timestamptz not null default now(),
 unique(case_id,kind,sha256),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id)
);
alter table public.professional_generated_packets enable row level security;
revoke all on public.professional_generated_packets from public,anon,authenticated;
grant select(id,org_id,case_id,attorney_id,kind,sha256,page_count,created_at) on public.professional_generated_packets to authenticated;
grant select,insert on public.professional_generated_packets to service_role;
create policy professional_generated_packets_read on public.professional_generated_packets for select to authenticated using
(attorney_id=(select auth.uid()) and (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.professional_cases c where c.id=professional_generated_packets.case_id and c.org_id=professional_generated_packets.org_id and c.attorney_id=professional_generated_packets.attorney_id));
create index professional_generated_packets_case_idx on public.professional_generated_packets(case_id,created_at desc);
commit;
