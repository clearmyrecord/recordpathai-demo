-- Separate, owner-scoped notification email from login, billing and Step 1 intake.
-- Server/service_role maintains verification secrets; never expose them via API responses.
-- Apply before deploying the consent-first checkout service.
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recordwatch_notification_email_format'
      AND conrelid = 'public.recordwatch_notification_preferences'::regclass
  ) THEN
    ALTER TABLE public.recordwatch_notification_preferences
      ADD CONSTRAINT recordwatch_notification_email_format
      CHECK (
        notification_email IS NULL OR (
          length(notification_email) <= 254
          AND notification_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        )
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.recordwatch_notification_preferences
  VALIDATE CONSTRAINT recordwatch_notification_email_format;

-- The underlying preference table already has RLS enabled; the authenticated
-- role has no UPDATE privilege. Verification tokens are never returned by
-- the app's authenticated preference API. Customer messages remain opt-in.
