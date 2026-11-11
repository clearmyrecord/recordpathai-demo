// Court-specific operational facts: checked against official sources.
// Adding a profile never authorizes eligibility, collecting money or mailing.
const clean = value => String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
export const normalizeCourtState = value => ["oh","ohio"].includes(clean(value)) ? "OH" : clean(value).toUpperCase();
export const normalizeCourtType = value => {
  const c=clean(value);
  return ["court-of-common-pleas","common-pleas","common-pleas-court"].includes(c)
    ? "court-of-common-pleas" : c;
};
export const normalizeCourtCounty = value => clean(value).replace(/-county$/,"");
export const normalizeCourtFormType = value => {
  const c=clean(value);
  if(["sealing-conviction","conviction","convicted","sealing-of-conviction"].includes(c)) return "sealing-conviction";
  if(["sealing-dismissal","nonconviction","dismissal","dismissed","acquittal","not-guilty","no-bill"].includes(c)) return "sealing-dismissal";
  return "";
};
const woodCommon = Object.freeze({
  id:"oh-wood-common-pleas",
  state:"OH", county:"wood", courtType:"court-of-common-pleas",
  courtName:"Wood County Court of Common Pleas",
  clerk:"Wood County Clerk of Courts — Legal Office",
  postalAddress: Object.freeze({
    name:"Wood County Clerk of Courts",
    address_line1:"One Courthouse Square",
    address_line2:"Second Floor, Courthouse",
    address_city:"Bowling Green",address_state:"OH",address_zip:"43402"
  }),
  mailingVerifiedDate:"2026-11-07",
  sourceAddress:"https://clerkofcourt.co.wood.oh.us/167/Location-Hours",
  sourceFees:"https://clerkofcourt.co.wood.oh.us/189/Criminal-Division-of-the-Clerk-of-Courts",
  sourceRules:"https://www.co.wood.oh.us/lawlibrary/Common_Plea_CH3.html",
  officialForm:"https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/142/Application-for-Sealing-295332-Conviction-PDF",
  electronicSealingAccepted:false,
  submissionMethod:"physical-only-pending-clerk-confirmation",
  courtFeePayee:"Wood County Clerk of Courts", // Official Clerk payment page, verified 2026-11-11.
  payeeSource:"https://clerkofcourt.co.wood.oh.us/166/Make-a-Payment",
  lobChecksAuthorized:false, // Keep disabled pending successful sandbox proof, court filing workflow and operator authorization.
  mappedApprovedFormTypes:["sealing-conviction"],
  maxAttachmentPages:6, // conservative Lob attachment limit
  trackingGuarantee:false
});

export const courtProfiles = Object.freeze([woodCommon]);

export function findCourtProfile(input={}) {
  const state=normalizeCourtState(input.state||input.caseState||input.case_state);
  const county=normalizeCourtCounty(input.county||input.caseCounty);
  const type=normalizeCourtType(input.courtType||input.court_type);
  return courtProfiles.find(p=>p.state===state && p.county===county && p.courtType===type)||null;
}
export function courtFilingPlan(input={}) {
  const profile=findCourtProfile(input);
  const formType=normalizeCourtFormType(input.formType||input.form_type||input.finalOutcome);
  if(!profile) return {
    supported:false, filingMethod:"unverified", mailReady:false, onlineFeePaymentReady:false,
    courtFeeCents:null, profileId:null, reason:"No approved court-specific filing profile. Confirm the actual court and current rules."
  };
  const courtFeeCents=formType==="sealing-conviction"?10000:formType==="sealing-dismissal"?0:null;
  return {
    supported:Boolean(formType) && profile.mappedApprovedFormTypes.includes(formType), profileId:profile.id,
    courtName:profile.courtName, address:profile.postalAddress,
    courtFeeCents, courtFeePayee:profile.courtFeePayee,
    filingMethod:profile.submissionMethod,
    mailReady:profile.lobChecksAuthorized && Boolean(profile.courtFeePayee),
    onlineFeePaymentReady:false, postalTrackingGuaranteed:profile.trackingGuarantee,
    sourceFees:profile.sourceFees, sourceRules:profile.sourceRules,
    reason:courtFeeCents===null
      ?"All final charge outcomes must be verified before quoting the court deposit."
      :"Court-specific facts identified. Payment, check payee, mailing authorization and legal approval still require verification."
  };
}
