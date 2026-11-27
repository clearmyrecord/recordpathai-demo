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


test("professional reuses actual consumer Step 2 sections and charge template with full Supabase readback",()=>{
 const js=read("js/professional-practice.js"),html=read("professional-practice.html"),consumer=read("record-details.html"),shared=read("js/professional-record-intake.js");
 assert.match(html,/id="recordDetailsForm"/);
 assert.match(consumer,/id="sharedRecordChargeTemplate"/);
 assert.match(consumer,/getElementById\("sharedRecordChargeTemplate"\)\.content\.cloneNode/);
 for(const id of ["courtSectionTitle","recordCollectionTitle","chargesSectionTitle","sentencingSectionTitle","arrestSectionTitle"]){assert.ok(consumer.includes('aria-labelledby="'+id+'"'));assert.ok(shared.includes('"'+id+'"'));}
 assert.match(shared,/fetch\("record-details\.html",\{cache:"no-store"/);
 assert.match(shared,/RecordPathRecordDetailsFields\.capture\(mount\)/);
 assert.match(shared,/record_details:snapshot/);
 assert.match(js,/sameRecordSnapshot\(snapshot,persisted\.record_details\)/);
 assert.match(js,/api\.from\("professional_cases"\)\.insert\(payload\)/);
 assert.match(js,/persisted\.case_number/);
 assert.match(js,/persisted\.client_id/);
 assert.match(js,/row\.record_details\.charges\.entries\(\)/);
 const form=html.match(/<form id="client-form"[\s\S]*?<\/form>/)[0];
 const mapping=js.split("\n").find(line=>line.startsWith('bindForm("client-form","professional_clients"'));
 for(const m of form.matchAll(/\bname="([a-z_]+)"/g))assert.ok(mapping.includes(m[1]+":v."+m[1]));
 assert.match(shared,/fetch\("eligibility\.html",\{cache:"no-store"/);
 assert.match(shared,/getElementById\("user-profile-form"\)/);
 for(const field of ["full_name","dob","other_names","email","phone","line1","line2","city","state","zip"])assert.ok(mapping.includes(field+":v."+field),"Missing shared personal field: "+field);
 assert.doesNotMatch(js+shared,/localStorage|sessionStorage|indexedDB|document\.cookie|RecordPathUserStore/);
 const sql=read("sql/professional-full-record-intake.sql");
 assert.match(sql,/jsonb_array_length\(new\.record_details->'charges'\)=1/);
 assert.match(sql,/new\.outcome:='mixed'/);
 assert.match(sql,/f->>'allChargesConfirmed'='yes'/);
 assert.match(sql,/f->>'proceedingsStatus'='none'/);
});


test("professional and consumer charge intake ask for only one completion date",()=>{
 const consumer=read("record-details.html"),shared=read("js/professional-record-intake.js");
 const template=consumer.match(/<template id="sharedRecordChargeTemplate">([\s\S]*?)<\/template>/)[1];
 assert.equal((template.match(/data-field="disposition_date"/g)||[]).length,1);
 assert.equal((template.match(/data-field="discharge_date"/g)||[]).length,1);
 assert.doesNotMatch(template,/data-field="probation_end_date"/);
 assert.doesNotMatch(shared,/dataset\.field="probation_end_date"|Probation termination date \(if applicable\)/);
 assert.match(shared,/final_discharge_date:c\.discharge_date\|\|null,probation_end_date:null/);
});
