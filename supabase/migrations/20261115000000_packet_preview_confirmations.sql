-- Private customer confirmation of the EXACT approved PDF before Stripe checkout.
-- Preview confirms document visibility, NOT eligibility, fee settlement, or court filing.
CREATE TABLE IF NOT EXISTS public.packet_preview_confirmations (
  user_id uuid NOT NULL,
  case_id uuid NOT NULL REFERENCES public.saved_cases(id) ON DELETE CASCADE,
  signed_pdf_sha256 text NOT NULL CHECK (signed_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  case_snapshot_sha256 text NOT NULL CHECK (case_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,case_id)
);
ALTER TABLE public.packet_preview_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.packet_preview_confirmations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.packet_preview_confirmations TO service_role;
COMMENT ON TABLE public.packet_preview_confirmations IS
  'Service-only account-bound acknowledgment of the exact reviewed private packet PDF; cannot unlock a court filing or substitute for a Stripe paid session.';
