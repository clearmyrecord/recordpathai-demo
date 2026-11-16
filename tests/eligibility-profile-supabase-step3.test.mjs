import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=source("eligibility.html");
const packet=source("packet.html");
const contact=source("js/packet-contact.js");
const sync=source("js/eligibility-profile-sync.js");
const values={
  fullName:"Example Filing Name",street:"Verified Street",unit:"Unit 2",
  city:"Henderson",state:"NV",zip:"89012",
  phone:"7025550182",email:"filing@example.org"
};
function setup({id="owner-1",row={id:"owner-1",full_name:"Account name",email:"login@example.org"}}={}){
  const events=[];
  const db={
    auth:{getUser:async()=>({data:{user:{id}}})},
    from(table){
      assert.equal(table,"profiles");
      return {
        select(columns){events.push(["select",columns]);return this;},
        update(payload){events.push(["update",payload]);Object.assign(row,payload);return this;},
        eq(column,v){events.push(["eq",column,v]);return this;},
        async single(){return {data:row,error:null};},
        async maybeSingle(){return {data:row,error:null};}
      };
    }
  };
  const window={RecordPathSupabase:{getClient:async()=>db}};
  const context=vm.createContext({window,globalThis:window});
  vm.runInContext(contact,context);
  vm.runInContext(sync,context);
  return {sync:window.RecordPathEligibilityProfile,row,events};
}
test("Step 1 stores contact/mailing in authenticated Supabase profiles",async()=>{
  const x=setup();
  const got=await x.sync.save(values);
  assert.equal(got.street,values.street);
  assert.equal(x.row.mailing_line1,values.street);
  assert.equal(x.row.filing_full_name,values.fullName);
  assert.equal(x.row.filing_email,values.email);
  assert.equal(x.row.email,"login@example.org","Auth login email must remain unchanged");
  assert.deepEqual(x.events.filter(e=>e[0]==="eq").map(e=>e.slice(1)),[["id","owner-1"]]);
  assert.ok(x.events.some(e=>e[0]==="update"));
});
test("Step 1 rejects incomplete contacts before a database write",async()=>{
  const x=setup();
  await assert.rejects(()=>x.sync.save({...values,street:""}),/Street address/);
  assert.equal(x.events.length,0);
});
test("Step 1 prefill reads only authenticated owner profile",async()=>{
  const row={id:"owner-1",full_name:"Account name",email:"login@example.org",
    filing_full_name:"Verified Filing Name",filing_email:"filing@example.org",
    filing_phone:"7025550182",mailing_line1:"Saved Street",mailing_line2:"Unit 2",
    mailing_city:"Henderson",mailing_state:"NV",mailing_zip:"89012"};
  const x=setup({row});
  const loaded=await x.sync.load();
  assert.equal(loaded.values.street,"Saved Street");
  assert.equal(loaded.values.fullName,"Verified Filing Name");
  assert.equal(loaded.fullySaved,true);
  assert.deepEqual(x.events.filter(e=>e[0]==="eq").map(e=>e.slice(1)),[["id","owner-1"]]);
});
test("Profile updates cannot return a different account row",async()=>{
  const x=setup({row:{id:"another-owner",full_name:"Different Person",email:"different@example.org"}});
  await assert.rejects(()=>x.sync.save(values),/Supabase could not save/);
});
test("Eligibility Save and Continue await account persistence before navigation",()=>{
  const start=html.indexOf("async function saveStepOne(");
  const end=html.indexOf('document.querySelectorAll("#user-profile-form input',start);
  const code=html.slice(start,end);
  assert.match(code,/await RecordPathEligibilityProfile\.save\(RecordPathEligibilityProfile\.fromForm\(document\)\)/);
  assert.ok(code.indexOf("await RecordPathEligibilityProfile.save")<code.indexOf('window.location.href="record-details.html"'));
  assert.doesNotMatch(code,/alert\("Intake saved\."\)/);
  assert.match(html,/js\/eligibility-profile-sync\.js/);
});
test("Step 3 displays the independent review checklist for HTTP 409",()=>{
  const begin=packet.indexOf("async function inspectPacketReadiness(");
  const end=packet.indexOf("// The original court PDF",begin);
  assert.ok(begin>0&&end>begin);
  const code=packet.slice(begin,end);
  assert.match(code,/response\.status!==409/);
  assert.match(code,/renderPacketReviewChecklist\(data\)/);
  assert.match(packet,/if\(review\.ready!==true\)/);
  assert.match(packet,/checkServerPacketReadiness\(verifiedCaseId,fulfillment\)/);
  assert.match(packet,/id="packetReviewStatus"/);
});
