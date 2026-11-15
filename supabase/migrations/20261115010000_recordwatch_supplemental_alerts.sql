-- Extend paid RecordWatch alerts without enrolling any nonconsenting customer.
-- Court changes may originate ONLY from a verified operator/court integration event.
-- Live delivery continues to require paid Stripe entitlement, recipient consent,
-- email verification and/or Twilio approval. No historical bulk send.
ALTER TABLE public.recordwatch_notification_preferences
  ADD COLUMN IF NOT EXISTS packet_progress_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS missing_details_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.recordwatch_alert_deliveries
  ADD COLUMN IF NOT EXISTS source_event_key text;
ALTER TABLE public.recordwatch_alert_deliveries
  DROP CONSTRAINT IF EXISTS recordwatch_alert_deliveries_kind_check;
ALTER TABLE public.recordwatch_alert_deliveries
  ADD CONSTRAINT recordwatch_alert_deliveries_kind_check CHECK(kind IN (
    'eligibility_180_day','eligibility_90_day','eligibility_30_day',
    'eligibility_7_day','eligibility_reached','test',
    'packet_progress_3_day','packet_progress_7_day','packet_progress_14_day',
    'missing_details_3_day','missing_details_7_day','missing_details_14_day',
    'court_status_update'
  ));
-- A verified court update has its own durable event key so a scheduler rerun,
-- an outage or a second status change on the same day cannot cause duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS recordwatch_alert_deliveries_court_event_idx
  ON public.recordwatch_alert_deliveries(saved_case_id,source_event_key,channel);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.recordwatch_alert_deliveries'::regclass
    AND conname='recordwatch_alert_source_event_key_format') THEN
    ALTER TABLE public.recordwatch_alert_deliveries
      ADD CONSTRAINT recordwatch_alert_source_event_key_format CHECK(
        source_event_key IS NULL OR
        (length(source_event_key) BETWEEN 8 AND 160 AND
         source_event_key ~ '^[a-zA-Z0-9_:.\\-]+$')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.recordwatch_verified_court_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_case_id uuid NOT NULL REFERENCES public.saved_cases(id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK(
    length(event_key) BETWEEN 8 AND 160 AND
    event_key ~ '^[a-zA-Z0-9_:.\-]+$'),
  court_status text NOT NULL CHECK(court_status IN (
    'RECEIVED','UNDER_REVIEW','CORRECTION_REQUESTED','ACCEPTED','FILED',
    'HEARING_SCHEDULED','GRANTED','DENIED','CLOSED')),
  occurred_on date NOT NULL,
  verified_source text NOT NULL CHECK(verified_source IN ('operator_verified','court_integration')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  evidence_url text NOT NULL CHECK(
    length(evidence_url) BETWEEN 12 AND 2000 AND evidence_url LIKE 'https://%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(saved_case_id,event_key)
);
CREATE INDEX IF NOT EXISTS recordwatch_verified_court_events_recent_idx
  ON public.recordwatch_verified_court_events(saved_case_id,verified_at DESC);
ALTER TABLE public.recordwatch_verified_court_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recordwatch_verified_court_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recordwatch_verified_court_events TO service_role;

INSERT INTO public.recordwatch_alert_migration_receipts(id)
VALUES ('20261115010000_recordwatch_supplemental_alerts')
ON CONFLICT (id) DO NOTHING;
