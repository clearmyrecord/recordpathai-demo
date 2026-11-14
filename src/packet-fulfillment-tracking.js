// Customer-facing, privacy-safe projection of private filing records.
// No client can assert payment, create mailing, or alter court verification.
// A Lob check ID is an internal order reference, NOT a postal tracking number.
export const PACKET_JOB_STATUSES = Object.freeze([
  "paid_hold","ready_for_dispatch","submitted_to_lob",
  "manual_filing","delivered","failed","cancelled"
]);
const STAGE_LABELS = Object.freeze({
  drafted:"Signed court packet",approved:"Court-specific review",
  paid:"Verified packet payment",submitted:"Lob check submission",
  mailed:"USPS mailing",delivered:"Delivery confirmation",
  court:"Court receipt / filing"
});
function stage(id,done,description,warning=false){
  return {id,label:STAGE_LABELS[id],state:done?"complete":warning?"attention":"pending",description};
}
export function projectPacketFulfillment({draft=null,review=null,job=null}={}){
  const status=PACKET_JOB_STATUSES.includes(job?.status)?job.status:"not_paid";
  const uploaded=Boolean(draft?.signed_pdf_sha256);
  const approved=Boolean(review?.status==="approved" && uploaded &&
    review.signed_pdf_sha256===draft.signed_pdf_sha256 &&
    review.signed_pdf_private_path===draft.signed_pdf_private_path);
  const paid=Boolean(job && status!=="not_paid" && status!=="cancelled");
  const digitalOnly=Boolean(job?.payment_method==="digital_only" && paid);
  const lobSubmitted=Boolean(job?.lob_check_id && ["submitted_to_lob","delivered"].includes(status));
  const mailed=Boolean(lobSubmitted && job?.mailed_at);
  const delivered=Boolean(status==="delivered" && lobSubmitted && mailed);
  const issue=["failed","cancelled"].includes(status);
  const steps=[
    stage("drafted",uploaded,uploaded?"Signed PDF saved privately for review":"Generate and sign the court-specific PDF"),
    stage("approved",approved,approved?"Signed packet reviewed for the selected court":"Reviewer approval and eligibility confirmation required"),
    stage("paid",paid,paid?(digitalOnly?"Verified $50 digital packet payment; no court fee collected":"Stripe payment recorded for packet + any court fee"):"No verified packet payment recorded",issue)
  ];
  if(!digitalOnly){
    steps.push(stage("submitted",lobSubmitted,lobSubmitted?"Check and signed packet accepted by Lob":"No Lob check has been submitted"));
    steps.push(stage("mailed",mailed,mailed?"Mailing recorded after Lob verification":"USPS mailing not yet verified"));
    steps.push(stage("delivered",delivered,delivered?"Delivery recorded after Lob verification":"Delivery not yet verified"));
  }
  steps.push(stage("court",false,digitalOnly?
    "Self-filing: pay any required court fee directly and confirm the Clerk accepts your filing":
    "Court receipt and filing acceptance must be confirmed separately"));
  let summary="No packet payment or mailing has been recorded.";
  if(uploaded)summary="Signed packet saved privately; independent review and payment are still required.";
  if(approved)summary="Signed packet approved for the reviewed case. No mailing is implied.";
  if(status==="paid_hold"||status==="ready_for_dispatch")
    summary="Packet payment recorded. The order is on hold pending authorized fulfillment; nothing has been mailed.";
  if(digitalOnly)summary=approved?
    "Your approved signed digital packet is available for download. Any court fee and filing are your responsibility; nothing was mailed.":
    "Digital packet payment recorded. Your signed review copy needs support verification before download; nothing was mailed.";
  if(status==="submitted_to_lob")
    summary=mailed?"Lob has reported the check mailed. Court acceptance is not confirmed.":
      "Lob accepted the check order. USPS mailing has not yet been verified.";
  if(status==="delivered")
    summary=delivered?"Delivery verified through Lob; court filing acceptance remains unconfirmed.":
      "Lob has reported delivery, but the mailing audit trail needs review.";
  if(status==="manual_filing")summary="A manual filing route has been selected; confirm delivery and court receipt separately.";
  if(issue)summary="This order needs support review. Do not purchase another packet or resubmit mail.";
  return {
    status,summary,steps,
    signed_pdf_uploaded:uploaded,
    independently_reviewed:approved,
    packet_payment_verified:paid,
    digital_packet_available:digitalOnly && approved,
    lob_submitted:lobSubmitted,
    mailed_verified:mailed,delivered_verified:delivered,
    court_receipt_verified:false,
    lob_check_reference:lobSubmitted?job.lob_check_id:null,
    postal_tracking_number:null,
    last_updated_at:job?.updated_at||job?.created_at||null,
    court_fee_cents:paid?Number(job.court_fee_cents)||0:null,
    preparation_fee_cents:paid?5000:null,
    fulfillment_method:paid?job.payment_method:null
  };
}
