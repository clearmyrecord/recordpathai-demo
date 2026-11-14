-- Apply ONLY to a separate PostgreSQL database named recordpathai_packet_sandbox.
-- No user data, production Supabase references, or Lob permissions allowed.
DO $$
BEGIN
  IF current_database() <> 'recordpathai_packet_sandbox' THEN
    RAISE EXCEPTION 'Refusing to initialize packet sandbox outside its isolated database';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.packet_sandbox_paid_holds(
  stripe_session_id text PRIMARY KEY
    CHECK (stripe_session_id ~ '^cs_test_[A-Za-z0-9]+$'),
  stripe_event_id text NOT NULL CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9_]+$'),
  user_id uuid NOT NULL,
  case_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'paid_hold' CHECK(status='paid_hold'),
  court_fee_cents integer NOT NULL CHECK(court_fee_cents=10000),
  payment_method text NOT NULL CHECK(payment_method='lob_check'),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- No Lob check ID/dispatch attempt columns exist by design.
