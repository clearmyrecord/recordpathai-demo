-- The service-only checkout and provisioning RPCs verify auth.users.id
-- and auth.users.email_confirmed_at. Grant only those columns to service_role.
-- No access is granted to anon/authenticated or to passwords, tokens, or email addresses.
begin;
grant select (id, email_confirmed_at) on auth.users to service_role;
commit;
