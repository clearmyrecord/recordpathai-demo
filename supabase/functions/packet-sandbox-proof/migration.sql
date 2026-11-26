-- Staging only. Extends the existing isolated, HMAC-verified test receipt.
alter table public.packet_sandbox_paid_holds
  add column if not exists lob_test_check_id text check (lob_test_check_id ~ '^chk_[a-zA-Z0-9]+$'),
  add column if not exists proof_window_started_at timestamptz;
