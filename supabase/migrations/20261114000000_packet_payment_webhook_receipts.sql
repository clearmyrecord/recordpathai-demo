-- Private, evidence-backed proof of a real Stripe-signed production
-- checkout event that created a matching paid packet fulfillment job.
-- Does not grant any right to issue a court check or mail a packet.
CREATE TABLE IF NOT EXISTS public.packet_payment_webhook_receipts (
  event_id text PRIMARY KEY
    CHECK (event_id ~ '^evt_[A-Za-z0-9_]{1,200}$'),
  stripe_session_id text NOT NULL
    REFERENCES public.packet_fulfillment_jobs(stripe_session_id)
    ON DELETE RESTRICT,
  event_type text NOT NULL
    CHECK (event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded')),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS packet_payment_receipts_recent
  ON public.packet_payment_webhook_receipts(received_at DESC);
ALTER TABLE public.packet_payment_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.packet_payment_webhook_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON public.packet_payment_webhook_receipts TO service_role;
COMMENT ON TABLE public.packet_payment_webhook_receipts IS
  'Server-only Stripe HMAC-verified LIVE checkout proof; no customer PII, no mail authorization. Sandbox events must never be inserted.';
