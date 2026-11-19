/* Build the Ohio statewide standard-form coverage ledger.
   This records mapped Supreme Court forms for every non-Wood county without
   pretending that a local court accepts the standard form or that filing is
   ready. No payment, mailing, or court submission is enabled here. */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const counties=JSON.parse(fs.readFileSync(path.join(root,"data/ohio-counties.json"),"utf8"));
const nonWood=counties.filter(c=>c?.state==="OH"&&c.slug!=="wood");
if(nonWood.length!==87)throw new Error(`Expected 87 non-Wood Ohio counties; found ${nonWood.length}`);

const forms={
  "sealing-conviction":{
    id:"ohio-statewide-96-c1",
    title:"Supreme Court of Ohio Form 96-C1 — Application to Seal Record of Conviction",
    relief:"conviction",
    pdfPath:"assets/forms/ohio/statewide/application-to-seal-record-of-conviction-96-c1.pdf",
    mappingPath:"templates/ohio/statewide/sealing-conviction-96-c1.json",
    metadataPath:"assets/forms/ohio/statewide/conviction-metadata.json",
    sourcePdfPage:475,
    sourcePdfSha256:"1acaf4d8d8e32e6e8043b073c8241e4eb4a6d5b187bda5230345e0f300f058fe",
    mapped:true,
    active:false,
    status:"mapped_review_only"
  },
  "sealing-nonconviction":{
    id:"ohio-statewide-96-f1",
    title:"Supreme Court of Ohio Form 96-F1 — Application to Seal Records of Nonconviction",
    relief:"dismissal/not-guilty/no-bill",
    pdfPath:"assets/forms/ohio/statewide/application-to-seal-record-of-nonconviction-96-f1.pdf",
    mappingPath:"templates/ohio/statewide/sealing-nonconviction-96-f1.json",
    metadataPath:"assets/forms/ohio/statewide/nonconviction-metadata.json",
    sourcePdfPage:489,
    sourcePdfSha256:"deeda3dd8fb08623e462172602075ae901af9c1a0592ab5e7b07ade791f22097",
    mapped:true,
    active:false,
    status:"mapped_review_only"
  }
};

const coverage=nonWood.map(c=>({
  state:"OH", county:c.county, countySlug:c.slug, tier:c.tier,
  courtTypes:c.courtTypes,
  forms:Object.fromEntries(Object.entries(forms).map(([formType,form])=>[formType,{
    ...form,
    officialCourtUse:"Supreme Court standard form may be accepted; local court acceptance and any substantially-similar local form require confirmation.",
    localCourtReviewRequired:true,
    customerLinkApproved:false,
    filingPlanApproved:false
  }])),
  status:"mapped_review_only",
  active:false,
  customerLinkApproved:false,
  localCourtReviewRequired:true,
  exactCourtInventoryVerified:false,
  feeVerified:false,
  mailingAcceptanceVerified:false
}));

const output={
  schemaVersion:"recordpathai.ohio-statewide-form-coverage.v1",
  purpose:"Review-only statewide baseline for all non-Wood Ohio counties. It is not a local court approval, eligibility decision, checkout authorization, mailing authorization, or filing instruction.",
  authority:{
    name:"Supreme Court of Ohio",
    sourceUrl:"https://www.supremecourt.ohio.gov/docs/LegalResources/rules/superintendence/Superintendence.pdf",
    rule:"Rule 11.17 / Appendix D (formerly Sup.R. 96)",
    effectiveDate:"2020-10-01",
    verifiedAt:"2026-11-19",
    note:"Forms 96-A1 through 96-G3 are statewide standard forms; local courts may use substantially similar forms. The local court must still be verified before customer use."
  },
  coverageSummary:{
    nonWoodCountyCount:coverage.length,
    mappedFormTypes:Object.keys(forms).length,
    countyFormRecords:coverage.length*Object.keys(forms).length,
    activeFormRecords:0,
    filingEnabled:false,
    paymentEnabled:false,
    dispatchEnabled:false
  },
  forms,
  counties:coverage
};

const out=path.join(root,"data/ohio-statewide-form-catalog.json");
fs.writeFileSync(out,JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify(output.coverageSummary));
