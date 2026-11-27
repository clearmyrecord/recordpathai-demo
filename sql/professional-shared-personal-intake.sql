begin;
alter table public.professional_clients add column if not exists other_names text not null default '' check(length(other_names)<=240);
grant insert(other_names) on public.professional_clients to authenticated;
commit;
