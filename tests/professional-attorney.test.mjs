import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareProfessionalDraftData,renderProfessionalDraft} from "../js/professional-wood-draft.js";
const read=p=>readFileSync(new URL("../"+p,import.meta.url));
const client={id:"client1",org_id:"org1",attorney_id:"attorney1",full_name:"Example Person",line1:"1 Example St",line2:"Apt 2",city:"Bowling Green",state:"OH",zip:"43402",email:"example@example.invalid",phone:"419-555-0100",authorization_confirmed:true};
const base={id:"case1",client_id:client.id,org_id:client.org_id,attorney_id:client.attorney_id,court_id:"oh-wood-common-pleas",outcome:"conviction",case_number:"DEMO-001",judge_name:"Example",charge_name:"Example charge",charge_code:"0000.00",charge_level:"M1",disposition_date:"2020-01-01",final_discharge_date:"2021-02-03"};
const decision={case_id:base.id,org_id:base.org_id,attorney_id:base.attorney_id,decision:"approved_for_unsigned_draft",entire_case_reviewed:true};
test("exact court, confirmed authorization and immutable case review required",()=>{
 const q=prepareProfessionalDraftData(client,base,decision,"2026-11-26");
 assert.equal(q.courtFeeCents,10000);assert.match(q.template.map,/sealing-conviction/);assert.equal(q.data.charges[0].discharge_date,"02/03/2021");
 for(const bad of [{...base,outcome:"mixed"},{...base,court_id:"oh-wood-bowling-green-municipal"},{...base,attorney_id:"other"},{...base,final_discharge_date:null}])assert.throws(()=>prepareProfessionalDraftData(client,bad,decision,"2026-11-26"));
 assert.throws(()=>prepareProfessionalDraftData(client,base,{...decision,decision:"hold"},"2026-11-26"));
 assert.throws(()=>prepareProfessionalDraftData({...client,authorization_confirmed:false},base,decision,"2026-11-26"));
});
test("both nonconviction outcomes route to official dismissal PDF, $0 fee",()=>{
 for(const outcome of ["dismissal","not_guilty"]){const q=prepareProfessionalDraftData(client,{...base,outcome},decision,"2026-11-26");assert.equal(q.courtFeeCents,0);assert.match(q.template.map,/sealing-dismissal/);}
});
test("actual committed mappings produce two unsigned review pages in rendering harness",async()=>{
 for(const outcome of ["conviction","dismissal"]){
  const {template}=prepareProfessionalDraftData(client,{...base,outcome},decision,"2026-11-26");
  const mapping=JSON.parse(read(template.map));const source=read(template.pdf);assert.equal(source.subarray(0,5).toString(),"%PDF-");
  let calls=[];const pages=Array.from({length:4},(_,i)=>({getWidth:()=>612,getHeight:()=>792,drawText:(value,options)=>calls.push({i,value,options})}));
  const pdf={getPageCount:()=>pages.length,getPages:()=>pages,embedFont:async()=>({widthOfTextAtSize:(text,size)=>text.length*size*.42}),removePage:i=>pages.splice(i,1),save:async()=>new Uint8Array([pages.length])};
  const bytes=await renderProfessionalDraft({client,caseRow:{...base,outcome},decision,today:"2026-11-26",PDFLib:{PDFDocument:{load:async()=>pdf},StandardFonts:{Helvetica:"H",HelveticaBold:"B"},rgb:()=>null},fetcher:async path=>({ok:true,json:async()=>JSON.parse(read(path)),arrayBuffer:async()=>read(path)})});
  assert.equal(bytes[0],2);assert.equal(calls.filter(x=>x.value==="UNSIGNED REVIEW DRAFT - DO NOT FILE").length,2);
  assert.ok(calls.some(x=>x.value==="1 Example St, Apt 2"));assert.ok(calls.some(x=>x.value==="DEMO-001"));
 }
});
test("intake schema and UI do not collect SSN or enable payment, filing or broad staff access",()=>{
 const sql=read("sql/professional-client-workflow-staging.sql").toString();assert.match(sql,/client_intake_enabled boolean not null default false/);assert.match(sql,/attorney_id=\(select auth.uid\(\)\)/);assert.match(sql,/m.role='attorney'/);assert.doesNotMatch(sql,/social_security|ssn/i);
 const html=read("professional-attorney.html").toString();assert.match(html,/Staging only/);assert.match(html,/No SSN/);
});

test("actual applicant signature is placed once on official mapped page four and dated",async()=>{
 for(const outcome of ["conviction","dismissal","not_guilty"]){
  let calls=[],images=[];const pages=Array.from({length:4},(_,i)=>({getWidth:()=>612,getHeight:()=>792,drawText:(value,options)=>calls.push({i,value,options}),drawImage:(image,options)=>images.push({i,image,options})}));
  const signature=new Uint8Array(150).fill(1),image={width:640,height:160};
  const pdf={getPageCount:()=>pages.length,getPages:()=>pages,embedFont:async()=>({widthOfTextAtSize:(text,size)=>text.length*size*.42}),embedPng:async bytes=>{assert.equal(bytes,signature);return image;},removePage:i=>pages.splice(i,1),save:async()=>new Uint8Array([pages.length])};
  const params={client,caseRow:{...base,outcome},decision,today:"2026-11-26",PDFLib:{PDFDocument:{load:async()=>pdf},StandardFonts:{Helvetica:"H",HelveticaBold:"B"},rgb:()=>null},fetcher:async path=>({ok:true,json:async()=>JSON.parse(read(path)),arrayBuffer:async()=>read(path)})};
  await assert.rejects(renderProfessionalDraft({...params,applicantSignature:signature}));
  const bytes=await renderProfessionalDraft({...params,signatureReady:true,applicantSignature:signature});
  assert.equal(bytes[0],2);assert.equal(images.length,1);assert.equal(images[0].i,3);
  assert.ok(images[0].options.width>0&&images[0].options.height>0);
  assert.ok(calls.some(x=>x.i===3&&x.value==="11/26/2026"));
  assert.ok(!calls.some(x=>x.value.includes("DO NOT FILE")));
 }
});
