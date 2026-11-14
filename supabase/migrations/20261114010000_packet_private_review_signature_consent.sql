-- Account-bound consent evidence for private *document review only*.
-- Never infer filing authority or live court-fee authorization from this.
ALTER TABLE public.packet_drafts
  ADD COLUMN IF NOT EXISTS private_review_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS private_review_signature_mode text;
ALTER TABLE public.packet_drafts
  DROP CONSTRAINT IF EXISTS packet_drafts_private_review_signature_mode_check;
ALTER TABLE public.packet_drafts
  ADD CONSTRAINT packet_drafts_private_review_signature_mode_check
  CHECK (private_review_signature_mode IS NULL OR private_review_signature_mode = 'drawn');
COMMENT ON COLUMN public.packet_drafts.private_review_authorized_at IS
  'Authenticated applicant requested preparation of signed PDF for private review only, not court filing or payment.';
COMMENT ON COLUMN public.packet_drafts.private_review_signature_mode IS
  'Applicant asserted a current drawn signature was used for the private review PDF; operator must inspect independently.';
