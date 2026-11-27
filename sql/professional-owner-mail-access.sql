-- Private, explicitly granted owner filing access. Does not authorize payment or dispatch.
begin;
create table if not exists public.professional_owner_mail_access (
 org_id uuid not null references public.professional_pilot_orgs(id),
 user_id uuid not null references auth.users(id),
 granted_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 reason text not null check(length(trim(reason))>=12),
 primary key(org_id,user_id),
 check(expires_at>granted_at)
);
alter table public.professional_owner_mail_access enable row level security;
revoke all on public.professional_owner_mail_access from public, anon, authenticated;
grant select on public.professional_owner_mail_access to service_role;
commit;
