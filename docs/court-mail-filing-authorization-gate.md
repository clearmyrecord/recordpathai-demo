# Wood County court authorization gate

The technical ability to prepare signed forms, accept a Stripe payment or create a Lob check does not prove the clerk accepts a combined mailed application and deposit check.

As of November 12, 2026, `src/court-profiles.js` intentionally sets `lobChecksAuthorized:false` for Wood County Common Pleas. In addition to existing operator review, the release gate refuses live checkout for `fee_payment_method=lob_check` until the court profile marks the procedure authorized. The Lob request builder independently blocks any unapproved court.

Only after obtaining court-specific, documented clerk confirmation and verifying the exact filing requirements should an operator update the court profile and ship a new reviewed code release. Never change this flag based solely on a successful sandbox check or a Lob email.

No webhook emits mail automatically; refunds and disputes require separate handling; do not turn on live dispatch or court-deposit collection merely because the database or Stripe webhook is ready.

## Published Rule 3.03: preferred prepaid email option (verified November 14, 2026)

The published rules as amended through June 26, 2026 **do** provide an express email/fax exception for sealing/expungement applications when the court deposit is paid **before filing**. This is an ordinary filing route under Rule 3.03(A)(4)(p)*, not an endorsement of RecordPathAI.

- Official email: **clerkofcourts@woodcountyohio.gov**. Fax: **419-354-9241**. Do not send filing applications to Heidi Cully's individual address.
- Maximum email filing: **25 MB**, nonmodifiable searchable Adobe PDF; no cover page as first document page.
- Source document must be **physically signed and retained** through case closure and all postjudgment-relief opportunities. Rule 3.03(D) permits a scan/copy of the signed source or `/s/ Name` on the emailed copy **only when the physically signed original exists**. A browser-drawn signature is not sufficient evidence by itself of a physically signed original.
- Court deposit: **$100** standard conviction-sealing application, absent accepted waiver; direct Clerk payment before sending. Published online payment page: https://clerkofcourt.co.wood.oh.us/166/Make-a-Payment (case number required; separate payment vendor convenience fee). This **must not** be duplicated as a $100 Lob check funded by RecordPathAI.
- The Clerk can accept e-mail files 24/7 but may file those received after 4:30 pm or on weekends/holidays the next business day. A sent email, automated mail-server delivery and reply are **not** court acceptance. Verify the filed/stamped docket entry.
- **Current implementation status:** court profiles and customer-facing instructions support the email option, but automatic submission is **disabled**. Existing Stripe packet checkout still models a $150 Lob-funded route; it cannot be reused for the $50-only-preparation + direct-court-prepayment email route until a distinct, receipt-backed workflow is designed and tested.
- The verified Lob Bank of America account is the user's latest self-report, **not yet a verified Lob readback in our connected services**. Keep live mailing disabled until independent Lob API readback, check entitlement, approved signed packet, and operator authorization.

Official sources: [Local Rule 3.03](https://www.woodcountyohio.gov/DocumentCenter/View/2790/Wood-County-Rules-of-Practice-General-Division-of-the-Common-Pleas-of-Wood-County-Ohio-PDF), [Clerk payment page](https://clerkofcourt.co.wood.oh.us/166/Make-a-Payment).
