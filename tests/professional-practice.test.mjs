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
