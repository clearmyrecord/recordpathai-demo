import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {professionalProductionReady,professionalStagingReady} from "../src/professional-signed-review.js";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("production review accepts only the production project and keeps test billing isolated",()=>{
 const url="https://pfyxjhdlqgpzzzdssqpk.supabase.co",staging="https://ckrqmlnckhagskpumjbh.supabase.co";
 assert.equal(professionalProductionReady({url,key:"fixture"},{url,anonKey:"fixture"}),true);
 assert.equal(professionalStagingReady({url,key:"fixture"},{url,anonKey:"fixture"}),false);
 assert.equal(professionalProductionReady({url,key:"fixture"},{url:staging,anonKey:"fixture"}),false);
 const src=read("src/professional-signed-review.js");
 assert.match(src,/ctx.mode!=="staging"/);
 assert.match(src,/ctx.mode==="production"&&mode!=="applicant_external"/);
});
test("production practice has gated client access and no payment, automatic filing or counsel-assumption signing",()=>{
 const js=read("js/professional-practice.js"),html=read("professional-practice.html");
 assert.match(js,/pfyxjhdlqgpzzzdssqpk\.supabase\.co/);
 assert.match(js,/x.client_intake_enabled&&members.some/);
 assert.match(js,/currentLevel!=="aal2"/);
 assert.match(js,/renderProfessionalDraft/);
 assert.match(js,/professional_signed_reviews"\)\.insert/);
 assert.doesNotMatch(js,/\/api\/professional\/billing|localStorage|sessionStorage|Sign as counsel and save/);
 assert.match(html,/manual filing workflow/);
 assert.match(html,/No SSN/);
});
test("operator approval requires evidence, applicant consent and no public execute privilege",()=>{
 const sql=read("sql/professional-verified-pilot-activation.sql");
 assert.match(sql,/professional_real_intake_verified_release/);
 assert.match(sql,/status='pending'/);
 assert.match(sql,/r.plan not in \('legal_aid','university'\)/);
 assert.match(sql,/security invoker set search_path=''/);
 assert.match(sql,/revoke all on function public.professional_approve_pilot_request\(uuid,text,text,text,text\) from public,anon,authenticated/);
 assert.match(sql,/revoke all on function public.professional_approve_pilot_request\(uuid,text,text,text,text\) from service_role/);
 assert.match(sql,/insert into public.professional_activation_audit/);
});

test("professional dashboard follows consumer saved-case-first navigation and sequential intake",()=>{
 const js=read("js/professional-practice.js"),html=read("professional-practice.html");
 assert.ok(html.indexOf('id="saved-cases"')<html.indexOf('id="client-intake"'));
 assert.ok(html.indexOf('id="client-intake"')<html.indexOf('id="case-intake"'));
 assert.match(html,/id="client-intake" hidden/);assert.match(html,/id="case-intake" hidden/);
 for(const name of ["saved-case-card","saved-case-header","saved-case-actions","saved-case-detail-grid"])assert.ok(js.includes(name));
 for(const label of ["Resume","Record Details","Open Packet","Open RecordWatch"])assert.ok(js.includes('nav("'+label+'"'));
 assert.match(js,/showIntake\("case-intake"\)/);assert.match(js,/resolveEligibilityForCase/);
 assert.match(js,/professional_generated_packets/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|RecordPathUserStore\.setActiveCase/);
});


test("every professional intake field is explicitly mapped and verified against a fresh Supabase read before advancing",()=>{
 const js=read("js/professional-practice.js"),html=read("professional-practice.html");
 for(const [form,table] of [["client-form","professional_clients"],["case-form","professional_cases"]]){
  const formSource=html.match(new RegExp('<form id="'+form+'"[\\s\\S]*?<\\/form>'))[0];
  const fields=[...formSource.matchAll(/\bname="([a-z_]+)"/g)].map(m=>m[1]);
  const mapping=js.split("\n").find(line=>line.startsWith('bindForm("'+form+'","'+table+'"'));
  assert.ok(mapping);
  for(const field of fields)assert.ok(mapping.includes(field+":v."+field),"Missing database mapping: "+field);
 }
 const handler=js.slice(js.indexOf("function bindForm(id,table,build)"),js.indexOf('bindForm("client-form"'));
 assert.match(handler,/api\.from\(table\)\.insert\(payload\)\.select\("\*"\)\.single\(\)/);
 assert.match(handler,/api\.from\(table\)\.select\("\*"\)\.eq\("id",saved\.id\)\.eq\("org_id",org\)\.single\(\)/);
 assert.match(handler,/Object\.entries\(payload\)\.some\(\(\[key,value\]\)=>persisted\[key\]!==value\)/);
 assert.ok(handler.indexOf("Supabase readback mismatch")<handler.indexOf("form.reset()"));
 assert.match(handler,/persisted\.case_number/);
 assert.match(handler,/persisted\.client_id/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB|document\.cookie|RecordPathUserStore/);
});
