-- Extend the existing service-only atomic reservation to verified no-fee letters.
ALTER TABLE public.packet_fulfillment_jobs
  ADD COLUMN lob_letter_id text UNIQUE;

CREATE OR REPLACE FUNCTION public.reserve_packet_lob_dispatch(
  p_stripe_session_id text, p_case_id uuid
)
RETURNS SETOF public.packet_fulfillment_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_stripe_session_id !~ '^cs_live_[A-Za-z0-9]+$' OR p_case_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.packet_dispatch_controls
       WHERE id = true AND live_dispatch_enabled = true
     ) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_case_id::text, 80249));
  RETURN QUERY
    UPDATE public.packet_fulfillment_jobs AS target
       SET status = 'ready_for_dispatch', attempted_at = now()
     WHERE target.stripe_session_id = p_stripe_session_id
       AND target.case_id = p_case_id
       AND target.status = 'paid_hold'
       AND target.attempted_at IS NULL
       AND target.lob_check_id IS NULL
       AND target.lob_letter_id IS NULL
       AND (
         (target.payment_method = 'lob_check' AND target.court_fee_cents > 0)
         OR (target.payment_method = 'no_fee' AND target.court_fee_cents = 0)
       )
       AND EXISTS (
         SELECT 1 FROM public.packet_payment_webhook_receipts AS receipt
         WHERE receipt.stripe_session_id = target.stripe_session_id
           AND receipt.event_type IN (
             'checkout.session.completed',
             'checkout.session.async_payment_succeeded'
           )
       )
       AND EXISTS (
         SELECT 1
           FROM public.saved_cases AS saved
           JOIN public.packet_releases AS release
             ON release.case_id = saved.id AND release.user_id = saved.user_id
           JOIN public.packet_drafts AS draft
             ON draft.case_id = saved.id AND draft.user_id = saved.user_id
           JOIN public.packet_preview_confirmations AS preview
             ON preview.case_id = saved.id AND preview.user_id = saved.user_id
          WHERE saved.id = target.case_id
            AND saved.user_id = target.user_id
            AND saved.deleted_at IS NULL AND saved.archived_at IS NULL
            AND saved.case_state = 'OH'
            AND lower(trim(saved.county)) IN ('wood', 'wood county')
            AND saved.court_type = 'court-of-common-pleas'
            AND release.status = 'approved'
            AND release.fee_payment_method = target.payment_method
            AND (
              (target.payment_method = 'lob_check'
                AND release.form_type = 'sealing-conviction'
                AND nullif(trim(release.verified_check_payee), '') IS NOT NULL)
              OR (target.payment_method = 'no_fee' AND release.form_type = 'sealing-dismissal')
            )
            AND release.accepted_fee_waiver = false
            AND release.approved_court_fee_cents = target.court_fee_cents
            AND nullif(trim(release.verified_filing_address), '') IS NOT NULL
            AND nullif(trim(release.reviewer_id), '') IS NOT NULL
            AND release.reviewer_evidence_links <> '[]'::jsonb
            AND release.identity_verified
            AND release.official_docket_verified
            AND release.all_charges_verified
            AND release.final_discharge_verified
            AND release.statutory_exclusions_reviewed
            AND release.filing_instructions_verified
            AND release.exact_court_form_verified
            AND release.applicant_signature_verified
            AND release.filing_authorization_verified
            AND release.reviewed_at BETWEEN now() - interval '30 days' AND now()
            AND draft.private_review_signature_mode = 'drawn'
            AND draft.private_review_authorized_at IS NOT NULL
            AND draft.pdf_pages = 2
            AND draft.case_snapshot_sha256 = release.case_snapshot_sha256
            AND draft.signed_pdf_sha256 = release.signed_pdf_sha256
            AND draft.signed_pdf_private_path = release.signed_pdf_private_path
            AND preview.case_snapshot_sha256 = release.case_snapshot_sha256
            AND preview.signed_pdf_sha256 = release.signed_pdf_sha256
            AND preview.confirmed_at BETWEEN now() - interval '30 days' AND now()
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.packet_fulfillment_jobs AS other
          WHERE other.case_id = p_case_id AND other.id <> target.id
            AND (
              other.status IN (
                'paid_hold', 'ready_for_dispatch', 'submitted_to_lob', 'delivered'
              )
              OR other.lob_check_id IS NOT NULL
              OR other.lob_letter_id IS NOT NULL
              OR other.attempted_at IS NOT NULL
            )
       )
     RETURNING target.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_packet_lob_dispatch(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_packet_lob_dispatch(text, uuid)
  TO service_role;
