// Read-only published-fee and form directory; never a packet authorization.
export function metroCourtResource(registry,courtId,outcome){
 const court=registry.courts.find(c=>c.id===courtId);
 if(!court||!["conviction","nonconviction"].includes(outcome))return null;
 const courtFeeCents=outcome==="conviction"?court.convictionFeeCents:court.nonconvictionFeeCents;
 return {courtId:court.id,name:court.name,county:court.county,courtFeeCents,
  proposedPreparationCents:5000,illustrativeTotalCents:courtFeeCents+5000,
  officialForm:court[outcome],officialDirectory:court.directory,source:court.source,
  formNote:court.formNote,filing:court.filing,pdfReview:court.pdfReview,
  packetGenerationApproved:false,checkoutEnabled:false,automatedFilingEnabled:false};
}
