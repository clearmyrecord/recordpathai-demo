import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../js/packet-contact.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../packet.html",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20261115020000_packet_contact_profile.sql",import.meta.url),"utf8");
const context=vm.createContext({});
vm.runInContext(source,context);
const helper=context.RecordPathPacketContact;
const owned={id:"owner-123",fullName:"Test Applicant",email:"login@example.org",phone:"702-555-0134"};
const savedProfile={id:"owner-123",full_name:"Test Applicant",email:"login@example.org",phone:"702-555-0134",
  filing_email:"filing@example.org",filing_phone:"702-555-0180",
  mailing_line1:"123 Court Street",mailing_city:"Henderson",mailing_state:"NV",mailing_zip:"89012"};
const values={
  fullName:"Test Applicant",street:"123 Court Street",unit:"",city:"Henderson",
  state:"NV",zip:"89012",phone:"702-555-0180",email:"filing@example.org"
};
test("authenticated saved profile supplies the court contact and never guesses from court state",()=>{
  const packet={petitioner:{full_name:"Test Applicant",address:{state:"OH"}},court:{state:"OH",county:"Wood"}};
  const filled=helper.mergeForAccount(packet,savedProfile,owned);
  assert.equal(filled.street,"123 Court Street");
  assert.equal(filled.state,"NV","Mailing state is different from court state");
  assert.equal(filled.phone,"702-555-0180");
  assert.equal(filled.email,"filing@example.org");
  assert.equal(helper.validate(filled).length,0);
});
test("legacy browser contact from another account is not prefilled",()=>{
  const legacy={petitioner:{full_name:"Different Applicant",email:"other@example.org",
    address:{line1:"Unrelated address",city:"Reno",state:"NV",zip:"89501"}}};
  const fields=helper.mergeForAccount(legacy,{
    full_name:"Test Applicant",email:"login@example.org",phone:"702-555-0134"
  },owned);
  assert.equal(fields.fullName,"Test Applicant");
  assert.equal(fields.street,"");
  assert.equal(fields.email,"login@example.org");
  assert.ok(helper.validate(fields).includes("street"));
});
test("even an owner-tagged browser draft must never prefill court contact details",()=>{
  const packet={meta:{packet_contact_user_id:"owner-123"},petitioner:{
    full_name:"Test Applicant",phone:"702-555-0123",email:"contact@example.org",
    address:{line1:"Local saved street",city:"Henderson",state:"NV",zip:"89012"}}};
  const result=helper.mergeForAccount(packet,{},owned);
  assert.equal(result.street,"");
  assert.equal(result.email,"");
});
test("contact input validation rejects incomplete street, email and phone but keeps unit optional",()=>{
  assert.equal(helper.validate(values).length,0);
  assert.ok(helper.validate({...values,street:""}).includes("street"));
  assert.ok(helper.validate({...values,email:"not-an-email"}).includes("email"));
  assert.ok(helper.validate({...values,phone:"x"}).includes("phone"));
  assert.equal(helper.validate({...values,unit:""}).length,0);
});
test("applicant changes stay in contact fields, never overwrite court case data",()=>{
  const orig={court:{state:"OH",case_number:"2006CR0385"},charges:[{charge_name:"Test charge"}]};
  const output=helper.applyToDraft(orig,values,owned.id);
  assert.equal(output.court.case_number,"2006CR0385");
  assert.equal(output.charges[0].charge_name,"Test charge");
  assert.equal(output.petitioner.address.line1,values.street);
  assert.equal(output.petitioner.phone,values.phone);
  assert.equal(output.meta.packet_contact_user_id,owned.id);
  assert.equal(orig.petitioner,undefined);
  const profileUpdate=helper.profileUpdate(values);
  assert.equal(profileUpdate.mailing_line1,values.street);
  assert.equal(profileUpdate.filing_email,values.email);
  assert.equal(Object.hasOwn(profileUpdate,"email"),false,"Login email is never overwritten");
});
test("Step 1 requires contact confirmation and owner-scoped Supabase save before rendering the signed PDF",()=>{
  const step=html.indexOf('id="packetSubmitStep"');
  const first=html.indexOf('id="packetContactPanel"');
  const button=html.indexOf('id="prepareSignedReviewBtn"');
  assert.ok(step>=0&&first>step&&button>first);
  assert.match(html,/id="packetContactConfirmed"/);
  for(const key of helper.fields.map(f=>f.key))assert.match(html,new RegExp('data-packet-contact="'+key+'"'));
  const save=html.indexOf("async function persistPacketContactForReview()");
  const saveEnd=html.indexOf("function readPacketData()",save);
  const code=html.slice(save,saveEnd);
  assert.match(code,/getSession\(\)/);
  assert.match(code,/RecordPathPacketContact\.validate\(inputs\)/);
  assert.match(code,/confirmed\?\.checked!==true/);
  assert.match(code,/\.from\("profiles"\)/);
  assert.match(code,/\.eq\("id",user\.id\)/);
  assert.match(code,/persistPacketData\(raw\)/);
  const submitted=html.slice(html.indexOf("async function prepareSignedReviewPdf()"),html.indexOf("async function generateSealingPdf()"));
  assert.ok(submitted.indexOf("await persistPacketContactForReview()")>=0);
  assert.ok(submitted.indexOf("await persistPacketContactForReview()")<submitted.indexOf("renderSignedCourtPdfBytes(data,selected)"));
  assert.match(submitted,/clearApprovedPreviewImages\(\)/);
  assert.match(html,/getMissingRequiredFields\(data,schema,selected\)/);
  assert.match(html,/WOOD_CONTACT_REQUIRED_FIELDS/);
  assert.match(html,/last submitted signed draft/);
});
test("persistent profile extension is RLS-scoped and excludes SSNs and case data",()=>{
  assert.match(migration,/ALTER TABLE public\.profiles/);
  assert.match(migration,/ADD COLUMN IF NOT EXISTS mailing_line1/);
  assert.match(migration,/ADD COLUMN IF NOT EXISTS filing_phone/);
  const definitions=migration.split("\n").filter(line=>/ADD COLUMN IF NOT EXISTS/i.test(line)).join("\n");
  assert.doesNotMatch(definitions,/ssn|court_case|disposition/i);
});
