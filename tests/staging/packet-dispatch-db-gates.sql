-- STAGING ONLY. All synthetic rows and the temporary switch are rolled back.
-- No HTTP call, Stripe payment, Lob check, or court filing occurs.
BEGIN;
DO $test$
DECLARE
  owner_id uuid;
  synthetic_case uuid := gen_random_uuid();
  synthetic_session text := 'cs_live_STAGINGDBONLY' ||
    replace(gen_random_uuid()::text, '-', '');
  synthetic_event text := 'evt_STAGING_DB_ONLY_' ||
    replace(gen_random_uuid()::text, '-', '');
  snapshot_hash text := repeat('a', 64);
  pdf_hash text := repeat('b', 64);
  claims integer;
BEGIN
  SELECT id INTO owner_id FROM auth.users LIMIT 1;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Staging test account is unavailable';
  END IF;
  INSERT INTO public.saved_cases
    (id, user_id, case_state, county, court_type)
  VALUES (synthetic_case, owner_id, 'OH', 'Wood', 'court-of-common-pleas');
  INSERT INTO public.packet_drafts
    (case_id, user_id, case_snapshot_sha256, signed_pdf_sha256,
     signed_pdf_private_path, pdf_pages, private_review_authorized_at,
     private_review_signature_mode)
  VALUES (synthetic_case, owner_id, snapshot_hash, pdf_hash,
    'private/packets/' || synthetic_case || '/' || pdf_hash || '.pdf',
    2, now(), 'drawn');
  INSERT INTO public.packet_releases
    (case_id, user_id, status, form_type, case_snapshot_sha256,
     signed_pdf_sha256, signed_pdf_private_path, reviewer_id, reviewed_at,
     identity_verified, official_docket_verified, all_charges_verified,
     final_discharge_verified, statutory_exclusions_reviewed,
     filing_instructions_verified, exact_court_form_verified,
     applicant_signature_verified, filing_authorization_verified,
     accepted_fee_waiver, approved_court_fee_cents, fee_payment_method,
     verified_check_payee, verified_filing_address, reviewer_evidence_links)
  VALUES (synthetic_case, owner_id, 'approved', 'sealing-conviction',
    snapshot_hash, pdf_hash,
    'private/packets/' || synthetic_case || '/' || pdf_hash || '.pdf',
    'STAGING REVIEW FIXTURE', now(),
    true, true, true, true, true, true, true, true, true,
    false, 10000, 'lob_check',
    'STAGING TEST PAYEE', 'STAGING TEST ADDRESS',
    '["staging-fixture-only"]'::jsonb);
  INSERT INTO public.packet_preview_confirmations
    (user_id, case_id, signed_pdf_sha256, case_snapshot_sha256)
  VALUES (owner_id, synthetic_case, pdf_hash, snapshot_hash);
  INSERT INTO public.packet_fulfillment_jobs
    (case_id, user_id, stripe_session_id, status, court_fee_cents, payment_method)
  VALUES (synthetic_case, owner_id, synthetic_session,
    'paid_hold', 10000, 'lob_check');

  SELECT count(*) INTO claims FROM public.reserve_packet_lob_dispatch(
    synthetic_session, synthetic_case);
  IF claims <> 0 THEN RAISE EXCEPTION 'Disabled control accepted a check'; END IF;

  UPDATE public.packet_dispatch_controls SET live_dispatch_enabled = true
  WHERE id = true;
  SELECT count(*) INTO claims FROM public.reserve_packet_lob_dispatch(
    synthetic_session, synthetic_case);
  IF claims <> 0 THEN RAISE EXCEPTION 'Missing signed receipt accepted a check'; END IF;

  INSERT INTO public.packet_payment_webhook_receipts
    (event_id, stripe_session_id, event_type)
  VALUES (synthetic_event, synthetic_session, 'checkout.session.completed');
  UPDATE public.packet_preview_confirmations
    SET signed_pdf_sha256 = repeat('c', 64)
    WHERE case_id = synthetic_case;
  SELECT count(*) INTO claims FROM public.reserve_packet_lob_dispatch(
    synthetic_session, synthetic_case);
  IF claims <> 0 THEN RAISE EXCEPTION 'Changed preview accepted a check'; END IF;

  UPDATE public.packet_preview_confirmations
    SET signed_pdf_sha256 = pdf_hash WHERE case_id = synthetic_case;
  UPDATE public.packet_releases SET status = 'revoked'
    WHERE case_id = synthetic_case;
  SELECT count(*) INTO claims FROM public.reserve_packet_lob_dispatch(
    synthetic_session, synthetic_case);
  IF claims <> 0 THEN RAISE EXCEPTION 'Revoked review accepted a check'; END IF;

  UPDATE public.packet_releases SET status = 'approved'
    WHERE case_id = synthetic_case;
  SELECT count(*) INTO claims FROM public.reserve_packet_lob_dispatch(
    synthetic_session, synthetic_case);
  IF claims <> 1 THEN RAISE EXCEPTION 'Complete synthetic claim was rejected'; END IF;
  SELECT count(*) INTO claims FROM public.reserve_packet_lob_dispatch(
    synthetic_session, synthetic_case);
  IF claims <> 0 THEN RAISE EXCEPTION 'Duplicate claim was accepted'; END IF;
END;
$test$;
ROLLBACK;
SELECT live_dispatch_enabled = false AS dispatch_still_disabled
FROM public.packet_dispatch_controls WHERE id = true;
