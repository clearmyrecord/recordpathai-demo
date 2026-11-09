-- Separate, case-scoped RecordWatch notification email from eligibility intake
-- and authenticated billing email. Service role only may write verification fields.
-- Apply only after RecordWatch Premium delivery migration.
ALTER TABLE public.recordwatch_notification_preferences
  ADD COLUMN IF NOT EXISTS notification_email text;
ALTER TABLE public.recordwatch_notification_preferences
  ADD COLUMN IF NOT EXISTS notification_email_verified_at timestamptz;
ALTER TABLE public.recordwatch_notification_preferences
  ADD COLUMN IF NOT EXISTS notification_email_token_sha256 text;
ALTER TABLE public.recordwatch_notification_preferences
  ADD COLUMN IF NOT EXISTS notification_email_token_expires_at timestamptz;
ALTER TABLE public.recordwatch_notification_preferences
  ADD COLUMN IF NOT EXISTS notification_email_token_sent_at timestamptz;
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='recordwatch_notification_email_format'
      AND conrelid='public.recordwatch_notification_preferences'::regclass
  ) THEN
    ALTER TABLE public.recordwatch_notification_preferences
      ADD CONSTRAINT recordwatch_notification_email_format
      CHECK (notification_email IS NULL OR
             (length(notification_email) <= 254 AND
              notification_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+
ALTER TABLE public.recordwatch_notification_preferences
  VALIDATE CONSTRAINT recordwatch_notification_email_format;
-- Existing subscribed customers retain prior account-email behavior until
-- they explicitly select a separate notification address.
))
      NOT VALID;
  END IF;
END $;
ALTER TABLE public.recordwatch_notification_preferences
  VALIDATE CONSTRAINT recordwatch_notification_email_format;
-- Existing subscribed customers retain prior account-email behavior until
-- they explicitly select a separate notification address.
