# Proposal — modular RecordWatch, digital packet and optional print/mail checkout

Status: **DESIGN/STAGING ONLY**. No live billing changes or customer charges are authorized by this document or accompanying quote module. Requested pricing direction: November 8–9, 2026.

## Business offer (one filing/application where legally permitted)

| Selection | RecordPathAI charge | Court charges | Availability |
| --- | ---: | ---: | --- |
| Free three-step eligibility | $0 | None collected | Live |
| RecordWatch Premium, lifetime per saved case | $39 one-time | None collected | Existing live checkout |
| Court-specific reviewed signed PDF packet | $50 one-time | Applicant pays court directly if filing themselves | Planned; requires independent review and Stripe unlock |
| RecordWatch + digital packet | $89 one-time if both needed | Applicant pays court directly if filing themselves | Planned combined checkout |
| Optional Lob print-and-mail | Verified quoted mailing + handling price (not yet set) | Court deposit only when the merchant is authorized to remit it | **Blocked** pending Lob entitlement, court instructions, provider costs, and service-level tracking |

Wood County Common Pleas **conviction** illustration: $39 + $50 + $100 court deposit = $189 **before** optional Lob mailing/handling. If self-filing, the $100 goes directly to court, not through RecordPathAI. Wood County nonconviction filing may have a $0 court fee when applicable. Each court/outcome/waiver must be checked. No multiple paid case upgrades for multiple charges on one application where permitted; multi-case grouping is not yet live.

## Architecture to implement (not implemented by this proposal)

1. Preserve free eligibility as primary conversion CTA. On eligible or saved-case flow, offer independent checkboxes for RecordWatch and digital packet; allow self-filing without Lob.
2. Price entirely on the server and do not trust browser prices, user-editable metadata, or a localStorage flag. Check paid lifetime entitlement in Supabase/Stripe first; omit an already-purchased $39 fee. The existing single-case entitlement is the authority.
3. **Digital packet release:** keep current case-specific reviewer approval, identity/docket/charge and current-form checks, consent, validated signed PDF, private storage, hash and Stripe ownership checks. Remove the requirement for Lob bank/physical-dispatch readiness *only for a digital-only order*. Unlock the exact approved signed PDF after verified payment. Court fee remains out of the digital order, and direct court filing fees are explained before purchase.
4. **Combined Stripe Checkout** (future): show separate $39 RecordWatch and $50 packet line items and exact final amount. Do not simply add line items to existing checkouts. Current lifetime session verification requires **exactly $39**, and packet session verification ties its metadata to the packet order: implement a verified multi-item order/webhook and independent entitlement issuance, with no duplicate charges. Existing separate checkouts should continue to work until the combined route has passed tests.
5. **Optional physical fulfillment:** require verified court mail address/payee, filing instructions, permitted form and print requirements, a Lob product actually available to the account, exact per-piece costs and any handling fee. No mailing charge, court-fee escrow or court-fee remittance before these checks. Whether check+packet attachments are available on Lob's free Developer tier must be verified with Lob support; the published per-page check-attachment rate is not listed for that tier.
6. Itemize court fees as pass-through, not service revenue or affiliate commission. On authorization and successful payment, persist idempotent `paid_hold` job. Separate sending to Lob from court acceptance and from Stripe payment confirmation. On failed fulfillment never issue duplicate checks or charge again.
7. Display only provider-supported status events. Lob `check_* status` and mail tracking events are **not USPS Certified tracking numbers**. Do not advertise a tracking number/guarantee until the exact offered delivery service supports it.
8. Verify opt-in email/SMS notification delivery separately; RecordWatch Premium itself must not require SMS opt-in. Sales tax policy remains to be reviewed before enabling a new combined product. Stripe-only acceptance is not evidence of a customer receiving PDF or mail.

## Exact technical scope in the current app

- Current `src/packet-release.js` and `server.js:packetReleaseStatus` gate packet checkout on verified Lob bank if court fees are due and `fee_payment_method=lob_check`. Digital-only needs a separate, equally strict release mode.
- `server.js POST /api/create-checkout-session` currently uses one $50 service + court-fee line item, with `RECORDPATH_LIVE_PACKET_CHECKOUT` release flags. It must not silently collect court fees on digital-only purchases.
- `server.js POST /api/stripe/webhook` saves a `paid_hold` filing job; a separate packet webhook is not yet listed in the live Stripe account. Configure/test it without affecting the live RecordWatch webhook.
- Existing `src/recordwatch-lifetime.js` and the live lifetime webhook require a $39 exact-purchase receipt. A new combined order must be validated with its own line items and payment intent; **do not grant lifetime entitlements merely because the total is $89**.
- Existing `/api/packet/download-approved` retrieves and hashes the actual signed PDF after verified purchase. Preserve this security model and all review gates.
- `src/modular-offer-pricing.js` is an informational **fail-closed** pricing model only, not connected to live Stripe routes.

## Test-to-release gates

- $39 only; $50 only; $89 combined; existing lifetime user pays only $50; never pay twice for same packet.
- Self-filer with $100 court fee is charged $50 for packet only; they pay $100 directly to court.
- Mailing requested with unknown Lob quote or unknown court fee: `totalCents=null`, no checkout.
- Dismissal with verified $0 court fee vs conviction with $100 are distinct.
- Signed PDF not approved / missing signature / case changed / fee unverified: fail closed.
- Verified payment unlocks exact authorized PDF and writes ledger once. Refund/dispute revokes appropriate entitlement and prevents unreviewed delivery.
- Download-only payment must never queue Lob or mark a case filed.
- Lob 403 or missing verified funding, unavailable check attachments, unsupported court or missing tracking: no dispatch, and no promise of mail/delivery.
- CI, sandbox end-to-end, operator signoff and production payment tests before merging a live billing change.

## Source notes
- Lob Developer plan has $0 platform fee but per-piece print and postage charges: https://www.lob.com/pricing
- Lob detailed pricing lists **no Developer check-attachment page rate** and has paid-tier charges for check attachments: https://help.lob.com/print-and-mail/ready-to-get-started/pricing-details
- Lob check tracking events, not guaranteed Certified Mail: https://docs.lob.com/
