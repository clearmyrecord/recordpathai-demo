# RecordPathAI

RecordPathAI is an AI-powered legal workflow platform designed to help people navigate the criminal record sealing and expungement process with more clarity, speed, and affordability.

## What it does

RecordPathAI is being built to simplify a process that is often:
- confusing
- expensive
- inconsistent across jurisdictions
- inaccessible to people who need it most

The platform is designed to help users:
- check potential eligibility
- organize record details
- generate court-ready packet workflows
- understand filing steps and next actions

## Why it matters

Tens of millions of Americans have a criminal record, and a large percentage may be eligible for record sealing or expungement. Many never take action because:
- they do not know they may qualify
- they cannot afford an attorney
- the process is fragmented and difficult to understand
- eligibility timing and court requirements vary by state

RecordPathAI is being built to bridge that gap.

## Current product focus

This repository contains the front-end product demo and workflow prototype for:
- intake and user data collection
- record details collection
- packet generation flow
- document preparation experience
- court guidance workflow concepts

## Product direction

Planned and ongoing development includes:
- multi-state eligibility logic
- court-specific packet generation
- guided filing workflows
- automated reminders
- charge and disposition libraries
- expanded document automation
- future infrastructure for deeper court workflow integration

## Who it is for

RecordPathAI is being built for:
- individuals seeking a more affordable path to record relief
- community organizations and advocates
- legal aid and justice reform partners
- future court and justice-system integration opportunities

## Status

RecordPathAI is currently in active development.

This public repository is intended to demonstrate product direction, workflow design, and front-end user experience. Certain logic, automation, and proprietary implementation details may be maintained separately.

## Founder

Built by an entrepreneur focused on legal-tech, workflow automation, and scalable access-to-justice solutions.

## Contact

For partnership, pilot, or investor interest, reach out through LinkedIn or direct contact channels associated with RecordPathAI.

## Supabase configuration

RecordPathAI uses Supabase Auth and Postgres for production accounts. Configure these deployment environment variables:

- `SUPABASE_URL` (or `PUBLIC_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (or `PUBLIC_SUPABASE_ANON_KEY`)

Run `supabase/migrations/20260530000000_create_profiles_and_cases.sql` in your Supabase project to create `profiles` and `cases` with row-level security policies.

Packet checkout also requires `supabase/migrations/20260531000000_saved_cases_source_of_truth.sql`, which creates `public.saved_cases`, `public.case_charges`, and `public.case_events` with owner-only RLS policies. Apply it to the live Supabase project before enabling paid packet checkout:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

If the Supabase CLI is not available, paste the SQL from `supabase/migrations/20260531000000_saved_cases_source_of_truth.sql` into the Supabase SQL Editor and run it there.
