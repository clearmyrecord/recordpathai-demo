# Wood County court authorization gate

The technical ability to prepare signed forms, accept a Stripe payment or create a Lob check does not prove the clerk accepts a combined mailed application and deposit check.

As of November 12, 2026, `src/court-profiles.js` intentionally sets `lobChecksAuthorized:false` for Wood County Common Pleas. In addition to existing operator review, the release gate refuses live checkout for `fee_payment_method=lob_check` until the court profile marks the procedure authorized. The Lob request builder independently blocks any unapproved court.

Only after obtaining court-specific, documented clerk confirmation and verifying the exact filing requirements should an operator update the court profile and ship a new reviewed code release. Never change this flag based solely on a successful sandbox check or a Lob email.

No webhook emits mail automatically; refunds and disputes require separate handling; do not turn on live dispatch or court-deposit collection merely because the database or Stripe webhook is ready.
