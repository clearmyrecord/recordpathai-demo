import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const html=readFileSync(new URL("../packet.html",import.meta.url),"utf8");
const sectionStart=html.indexOf('id="packetSubmitStep"');
const panelAt=html.indexOf('id="missingInfoPanel"');
const reviewButtonAt=html.indexOf('id="prepareSignedReviewBtn"');
const previewAt=html.indexOf('id="approvedPreviewPanel"');

test("required-form fields appear inside Step 1, next to the private-review action",()=>{
  assert.ok(sectionStart > 0 && sectionStart < panelAt && panelAt < reviewButtonAt && reviewButtonAt < previewAt);
  assert.equal(html.split('id="missingInfoPanel"').length-1,1);
  assert.match(html,/id="missingInfoSummary"/);
  assert.match(html,/id="missingInfoPanel"[^>]*tabindex="-1"/);
  assert.match(html,/No PDF was uploaded/);
  assert.match(html,/focusMissingPrivateReviewFields\(\)/);
});

const start=html.indexOf("const PRIVATE_REVIEW_FIELD_LABELS =");
const end=html.indexOf("function readPacketData()",start);
assert.ok(start>0 && end>start);
const helper=html.slice(start,end);
function render(paths) {
  const panel={style:{},scrollIntoView:()=>{},focus:()=>{}};
  let saved=null,listener=null;
  const input={addEventListener:(type,fn)=>{if(type==="input")listener=fn}};
  const fields={innerHTML:"",replaceChildren(){this.innerHTML="";},
    querySelector:()=>null,
    querySelectorAll:()=>paths.some(p=>p==="petitioner.full_name")?[input]:[]};
  const summary={textContent:""};
  const document={getElementById:id=>({
    missingInfoPanel:panel,missingInfoFields:fields,missingInfoSummary:summary
  }[id]),};
  const raw={petitioner:{full_name:""}};
  const context={document,window:{RecordPathUserStore:{getCurrentUser:()=>({fullName:"Account Profile"})}},
    escapeHtml:s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;"),
    getByPath:()=>"",setByPath:(object,path,value)=>{if(path==="petitioner.full_name")object.petitioner.full_name=value},
    persistPacketData:object=>{saved=structuredClone(object)}
  };
  runInNewContext(helper+"\nrenderMissingInfoPanel(argumentsPaths,raw,{},null);",
    {...context,argumentsPaths:paths,raw});
  return {html:fields.innerHTML,summary:summary.textContent,display:panel.style.display,
    updateName:value=>listener?.({target:{getAttribute:()=> "petitioner.full_name",value}}),
    getSaved:()=>saved};
}

test("private-review gap shows readable name and saves an explicit customer edit",()=>{
  const output=render(["petitioner.full_name"]);
  assert.match(output.html,/Applicant's full legal name/);
  assert.match(output.html,/Use my saved account profile name/);
  assert.match(output.html,/data-path="petitioner.full_name"/);
  assert.match(output.summary,/1 required field is missing/);
  assert.equal(output.display,"block");
  output.updateName("Example Customer");
  assert.equal(output.getSaved()?.petitioner.full_name,"Example Customer");
});

test("canonical court and charge fields must be corrected in saved Record Details",()=>{
  const output=render(["court.case_number","charges.0.disposition_date"]);
  assert.match(output.html,/Court case number/);
  assert.match(output.html,/Charge disposition date/);
  assert.match(output.html,/Edit Record Details/);
  assert.doesNotMatch(output.html,/data-path="court.case_number"/);
  assert.doesNotMatch(output.html,/data-path="charges.0.disposition_date"/);
});

test("full SSN is not collected in browser draft storage",()=>{
  const output=render(["petitioner.ssn"]);
  assert.match(output.html,/sensitive field requires a secure form/);
  assert.doesNotMatch(output.html,/data-path="petitioner.ssn"/);
});

test("a missing required field prevents upload and names the blocker to the customer",()=>{
  const handler=html.slice(html.indexOf("async function prepareSignedReviewPdf()"),
    html.indexOf("async function generateSealingPdf()"));
  assert.match(handler,/renderMissingInfoPanel\(missing,raw,data,schema\)/);
  assert.match(handler,/if\(missing.length\)\{/);
  assert.match(handler,/focusMissingPrivateReviewFields\(\)/);
  assert.match(handler,/privateReviewFieldLabel\(path,schema\)/);
  const missing=handler.indexOf("if(missing.length)");
  const upload=handler.indexOf("const bytes=await renderSignedCourtPdfBytes");
  assert.ok(missing>=0 && upload>missing);
  assert.match(handler,/No PDF was uploaded/);
  assert.match(handler,/x-recordpath-private-review-consent/);
});
