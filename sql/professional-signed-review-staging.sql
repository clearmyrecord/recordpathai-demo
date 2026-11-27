-- STAGING ONLY. Documents remain private and immutable; no automatic filing.
begin;
-- Store small review PDFs as bounded bytea in staging, avoiding direct Storage metadata writes.
create table public.professional_signed_documents (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null, case_id uuid not null, attorney_id uuid not null,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 500 and 2097152 and substring(pdf_bytes from 1 for 5)=decode('255044462d','hex') and encode(sha256(pdf_bytes),'hex')=sha256),
 page_count integer not null check(page_count=2),
 attorney_signature_attested boolean not null check(attorney_signature_attested),
 created_at timestamptz not null default now(),
 unique(case_id,sha256),
 unique(org_id,case_id,attorney_id,id),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id)
);
create table public.professional_signed_reviews (
 document_id uuid primary key,
 org_id uuid not null, case_id uuid not null, attorney_id uuid not null default auth.uid(),
 exact_document_reviewed boolean not null check(exact_document_reviewed),
 created_at timestamptz not null default now(),
 foreign key(org_id,case_id,attorney_id,document_id) references public.professional_signed_documents(org_id,case_id,attorney_id,id)
);
alter table public.professional_signed_documents enable row level security;
alter table public.professional_signed_reviews enable row level security;
revoke all on public.professional_signed_documents,public.professional_signed_reviews from public,anon,authenticated;
grant select(id,org_id,case_id,attorney_id,sha256,page_count,attorney_signature_attested,created_at) on public.professional_signed_documents to authenticated;
grant select on public.professional_signed_reviews to authenticated;
grant insert(document_id,org_id,case_id,exact_document_reviewed) on public.professional_signed_reviews to authenticated;
grant select,insert,update,delete on public.professional_signed_documents,public.professional_signed_reviews to service_role;
create policy pro_document_read on public.professional_signed_documents for select to authenticated using
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=professional_signed_documents.case_id and c.org_id=professional_signed_documents.org_id and c.attorney_id=professional_signed_documents.attorney_id));
create policy pro_signed_review_read on public.professional_signed_reviews for select to authenticated using
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_signed_documents d where d.id=professional_signed_reviews.document_id and d.org_id=professional_signed_reviews.org_id and d.attorney_id=professional_signed_reviews.attorney_id));
create policy pro_signed_review_insert on public.professional_signed_reviews for insert to authenticated with check
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_signed_documents d where d.id=professional_signed_reviews.document_id and d.org_id=professional_signed_reviews.org_id and d.case_id=professional_signed_reviews.case_id and d.attorney_id=professional_signed_reviews.attorney_id));
-- Existing follow-up notes are permissible before signing; a reported court filing/order/hearing requires an exact signed-document review.
drop policy professional_case_events_insert on public.professional_case_events;
create policy professional_case_events_insert on public.professional_case_events for insert to authenticated with check
(attorney_id=(select auth.uid()) and exists(select 1 from public.professional_case_decisions d where d.case_id=professional_case_events.case_id and d.org_id=professional_case_events.org_id and d.attorney_id=professional_case_events.attorney_id and d.decision='approved_for_unsigned_draft')
 and (event_type='manual_followup' or exists(select 1 from public.professional_signed_reviews r where r.case_id=professional_case_events.case_id and r.org_id=professional_case_events.org_id and r.attorney_id=professional_case_events.attorney_id)));
create index professional_signed_documents_attorney_idx on public.professional_signed_documents(org_id,attorney_id);
create index professional_signed_reviews_case_idx on public.professional_signed_reviews(case_id);
commit;
