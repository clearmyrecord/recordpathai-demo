-- Prevent concurrent / repeated real Lob check creation. Run this migration
-- before deploying the guarded endpoint. No check is created by this migration.
-- PostgREST callers must authenticate as service_role; never expose the key.
create or replace function public.reserve_packet_lob_dispatch(
  p_stripe_session_id text,
  p_case_id uuid
)
returns setof public.packet_fulfillment_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_stripe_session_id !~ '^cs_live_[A-Za-z0-9]+$' or p_case_id is null then
    return;
  end if;

  -- Serializes different sessions for the same case as well as repeated clicks.
  perform pg_advisory_xact_lock(hashtextextended(p_case_id::text, 80249));

  return query
    update public.packet_fulfillment_jobs as target
       set status = 'ready_for_dispatch',
           attempted_at = now()
     where target.stripe_session_id = p_stripe_session_id
       and target.case_id = p_case_id
       and target.status = 'paid_hold'
       and target.attempted_at is null
       and target.lob_check_id is null
       and target.payment_method = 'lob_check'
       and target.court_fee_cents > 0
       and not exists (
         select 1 from public.packet_fulfillment_jobs as other
         where other.case_id = p_case_id
           and other.id <> target.id
           and (
             other.status in ('paid_hold','ready_for_dispatch','submitted_to_lob','delivered')
             or other.lob_check_id is not null
             or other.attempted_at is not null
           )
       )
    returning target.*;
end;
$$;

revoke all on function public.reserve_packet_lob_dispatch(text,uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_packet_lob_dispatch(text,uuid)
  to service_role;

-- Once attempted_at is set, errors and unknown Lob responses MUST stay on
-- hold for manual provider reconciliation. Never reset a claim automatically.
