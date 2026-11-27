// Informational only. Exact court ID prevents routing another Wood County municipal court here.
export function bowlingGreenResource(profile, {courtId,relief,outcome}={}){
 if(!profile || courtId!=="oh-wood-bowling-green-municipal" || profile.courtId!==courtId ||
 !["sealing","expungement"].includes(relief))return null;
 const classified=["conviction","dismissal"].includes(outcome);
 const fee=outcome==="conviction"?profile.fees.convictionCents:outcome==="dismissal"?profile.fees.nonconvictionExpectedCents:null;
 return {courtId,relief,outcome,officialForm:classified?profile.forms[relief]:null,
  courtFeeCents:fee,feeClerkConfirmed:outcome==="conviction",
  illustrativeTotalCents:fee===null?null:fee+profile.fees.serviceIllustrativeCents,
  manualReviewRequired:true,notarizationRequired:true,
  dismissalAffidavitClarificationRequired:outcome==="dismissal",
  packetGenerationApproved:false,checkoutEnabled:false,automatedFilingEnabled:false};
}
