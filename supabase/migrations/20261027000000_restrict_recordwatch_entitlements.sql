-- Prevent self-service clients from granting themselves paid RecordWatch status.
-- Run against the deployed Supabase project through the normal migration process.
drop policy if exists "RecordWatch subscriptions inserted by owner" on public.recordwatch_subscriptions;
create policy "RecordWatch subscriptions inserted by owner"
on public.recordwatch_subscriptions for insert to authenticated
with check (
  auth.uid() = user_id
  and plan_type = 'free'
  and premium_active = false
  and premium_started_at is null
  and premium_expires_at is null
);

-- Column-level privileges prevent clients from changing paid entitlement fields.
revoke insert, update on public.recordwatch_subscriptions from anon, authenticated;
grant insert (user_id, case_id, notification_email, notification_phone, notify_email, notify_sms, status)
on public.recordwatch_subscriptions to authenticated;
grant update (notification_email, notification_phone, notify_email, notify_sms, status)
on public.recordwatch_subscriptions to authenticated;

-- Server-side Stripe verification should use a privileged server credential,
-- never a client-provided plan or premium flag.
