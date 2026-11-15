-- Account-owned contact information for signed court packet preparation.
-- Do not put SSNs, medical facts or case outcomes in the reusable profile.
-- Existing 'profiles' RLS allows only auth.uid()=id to SELECT/UPDATE.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS filing_full_name text,
  ADD COLUMN IF NOT EXISTS filing_email text,
  ADD COLUMN IF NOT EXISTS filing_phone text,
  ADD COLUMN IF NOT EXISTS mailing_line1 text,
  ADD COLUMN IF NOT EXISTS mailing_line2 text,
  ADD COLUMN IF NOT EXISTS mailing_city text,
  ADD COLUMN IF NOT EXISTS mailing_state text,
  ADD COLUMN IF NOT EXISTS mailing_zip text;

-- Enforce bounded user inputs; nullable so existing users are not changed.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_packet_contact_limits;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_packet_contact_limits CHECK (
  length(coalesce(filing_full_name,''))<=160 AND
  length(coalesce(filing_email,''))<=254 AND
  length(coalesce(filing_phone,''))<=40 AND
  length(coalesce(mailing_line1,''))<=200 AND
  length(coalesce(mailing_line2,''))<=120 AND
  length(coalesce(mailing_city,''))<=120 AND
  length(coalesce(mailing_state,''))<=40 AND
  length(coalesce(mailing_zip,''))<=24
);
