-- RecordWatch removal: only unreferenced records can be permanently deleted.
-- Archive markers retain legal documents, payment records and tracking history.
begin;
create table if not exists public.professional_case_archives (
 case_id uuid primary key,
 org_id uuid not null,
 attorney_id uuid not null default auth.uid(),
 archived_at timestamptz not null default now(),
 foreign key(org_id,case_id,attorney_id) references public.professional_cases(org_id,id,attorney_id) on delete cascade
);
create table if not exists public.professional_client_archives (
 client_id uuid primary key,
 org_id uuid not null,
 attorney_id uuid not null default auth.uid(),
 archived_at timestamptz not null default now(),
 foreign key(org_id,client_id,attorney_id) references public.professional_clients(org_id,id,attorney_id) on delete cascade
);
alter table public.professional_case_archives enable row level security;
alter table public.professional_client_archives enable row level security;
revoke all on public.professional_case_archives,public.professional_client_archives from public,anon,authenticated;
grant select,insert,delete on public.professional_case_archives,public.professional_client_archives to authenticated;
create policy case_archive_read on public.professional_case_archives for select to authenticated using (
 attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=case_id and c.org_id=professional_case_archives.org_id and c.attorney_id=professional_case_archives.attorney_id));
create policy case_archive_insert on public.professional_case_archives for insert to authenticated with check (
 attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=case_id and c.org_id=professional_case_archives.org_id and c.attorney_id=professional_case_archives.attorney_id));
create policy case_archive_restore on public.professional_case_archives for delete to authenticated using (
 attorney_id=(select auth.uid()) and exists(select 1 from public.professional_cases c where c.id=case_id and c.org_id=professional_case_archives.org_id and c.attorney_id=professional_case_archives.attorney_id));
create policy client_archive_read on public.professional_client_archives for select to authenticated using (
 attorney_id=(select auth.uid()) and exists(select 1 from public.professional_clients c where c.id=client_id and c.org_id=professional_client_archives.org_id and c.attorney_id=professional_client_archives.attorney_id));
create policy client_archive_insert on public.professional_client_archives for insert to authenticated with check (
 attorney_id=(select auth.uid()) and exists(select 1 from public.professional_clients c where c.id=client_id and c.org_id=professional_client_archives.org_id and c.attorney_id=professional_client_archives.attorney_id));
create policy client_archive_restore on public.professional_client_archives for delete to authenticated using (
 attorney_id=(select auth.uid()) and exists(select 1 from public.professional_clients c where c.id=client_id and c.org_id=professional_client_archives.org_id and c.attorney_id=professional_client_archives.attorney_id));
-- Use the existing active workspace/AAL2/assigned-record SELECT predicate unchanged.
-- All existing dependent foreign keys remain NO ACTION / RESTRICT.
do $policy$
declare t text; read_predicate text;
begin
 foreach t in array array['professional_clients','professional_cases'] loop
  select qual into strict read_predicate from pg_policies where schemaname='public' and tablename=t and policyname=t||'_read' and cmd='SELECT';
  if read_predicate is null then raise exception 'Missing existing access predicate'; end if;
  execute format('create policy %I on public.%I for delete to authenticated using (%s)',t||'_delete_unreferenced',t,read_predicate);
  execute format('grant delete on public.%I to authenticated',t);
 end loop;
end $policy$;
commit;
