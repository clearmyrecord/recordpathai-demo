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


test("professional filing packet follows consumer preparation, preview and checkout layout",()=>{
 const js=read("js/professional-practice.js"),consumer=read("packet.html"),css=read("assets/professional-modern.css"),server=read("src/professional-signed-review.js");
 for(const label of ["Your Filing Packet","Your packet and court fees","Preview Your Actual Application (View Only)","Checkout After Independent Approval"]){assert.ok(consumer.includes(label));assert.ok((js+read("professional-packet.html")).includes(label));}
 assert.match(js,/professional-packet-mode/);
 assert.match(css,/\.professional-packet-mode #cases>\.saved-case-card:not\(\.packet-focused\)/);
 assert.match(js,/for\(const page of \[1,2\]\)/);
 assert.match(js,/await img\.decode\(\)/);
 assert.match(js,/\/preview\/.*page/);
 assert.match(js,/Confirm My Reviewed Pages/);
 assert.match(js,/\$0 — included/);
 assert.match(js,/Pay and Mail — \$110/);
 assert.match(server,/\/api\/professional\/signed-review\/:id\/preview\/:page/);
 assert.match(server,/renderWatermarkedPreviewPage\(bytes,page,d\.page_count,\{professional:true\}\)/);
 assert.match(server,/private, no-store/);
 assert.doesNotMatch(js,/localStorage|sessionStorage/);
});

test("held professional cases resume review in the consumer-style signed submission",()=>{
 const js=read("js/professional-practice.js"),server=read("src/professional-signed-review.js");
 assert.match(js,/current\?\.decision==="hold"/);
 assert.match(js,/await confirmCaseReview\(\)/);
 assert.match(js,/!contactConfirmed\.checked\|\|!caseReviewed\.checked/);
 assert.match(server,/req\.body\?\.entire_case_reviewed!==true/);
 assert.match(server,/decision=eq\.hold/);
 assert.match(server,/attorney_id=eq\."\+ctx\.user\.id/);
 assert.match(server,/!\["conviction","dismissal","not_guilty"\]\.includes\(c\.outcome\)/);
});
test("professional Step 1 submits the real signature directly and automatically loads the signed Step 2 preview",()=>{
 const js=read("js/professional-practice.js"),consumer=read("packet.html"),server=read("src/professional-signed-review.js");
 for(const label of ["Prepare My Real Signed Packet for Private Review","Draw your signature below","Confirm My Reviewed Pages Before Payment","Choose how your approved packet is fulfilled"]){assert.ok(consumer.includes(label));assert.ok(js.includes(label));}
 assert.doesNotMatch(js,/Approve unsigned draft|Generate & preview application|draftReviewed/);
 assert.match(js,/!signatureInk\|\|!signatureConsent\.checked\|\|!contactConfirmed\.checked\|\|!caseReviewed\.checked/);
 assert.match(js,/!==shownSnapshot/);
 assert.match(js,/signatureReady:true,applicantSignature/);
 assert.match(js,/x-professional-signature-attested/);
 assert.match(js,/Signed packet saved\. Loading Step 2 preview/);
 assert.match(js,/void loadPreview\(\)\.catch/);
 assert.match(js,/digitalChoice=deliveryOption\("digital"/);
 assert.match(js,/if\(!checkoutReady\)/);
 assert.match(server,/generated-packet\/:id\/preview\/:page/);
 assert.match(server,/kind=eq\.review_draft/);
 assert.match(server,/digest\(bytes\)!==d\.sha256/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB/);
});

test("professional client and case creation has three dedicated routes, not dashboard intake",()=>{
 const js=read("js/professional-practice.js"),css=read("assets/professional-modern.css");
 const pages=["professional-eligibility.html","professional-record-details.html","professional-packet.html"];
 const titles=["Your Personal Information","Your Case Information","Your Filing Packet"];
 for(const [i,page] of pages.entries()){
  const html=read(page);
  assert.ok(html.includes('data-workflow-step="'+(i+1)+'"'));
  assert.ok(html.includes(titles[i]));
  assert.ok(html.includes('id="professional-steps"'));
  assert.ok(js.includes('"'+page+'"'));
  assert.match(html,/js\/professional-practice\.js\?v=three-step-/);
 }
 assert.match(js,/if\(!routeStep\)\{navigateWorkflow\(id==="case-intake"\?2:1/);
 assert.match(js,/if\(panel===packetPanel&&!routeStep\)\{navigateWorkflow\(3/);
 assert.match(js,/if\(routeStep!==3\)\{packetPanel\.d\.remove\(\)/);
 assert.match(js,/if\(!active\|\|routeStep!==1\|\|routeClient\)return/);
 assert.match(js,/if\(!active\|\|routeStep!==2\|\|!routeClient\|\|!sharedIntake\)return/);
 assert.match(js,/navigateWorkflow\(2,\{clientId:saved\.id\}\)/);
 assert.match(js,/navigateWorkflow\(3,\{caseId:persisted\.id\}\)/);
 assert.match(js,/routeClient\.authorization_confirmed!==true/);
 assert.match(js,/\.eq\("org_id",orgId\(\)\)\.eq\("id",clientId\)\.maybeSingle\(\)/);
 assert.match(js,/if\(table==="professional_cases"\)q=q\.eq\("id",routeCase\.id\)/);
 assert.match(css,/professional-intake-mode>#saved-cases/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB/);
});

test("Add New Case opens Step 2 directly, while new clients start in Step 1",()=>{
 const js=read("js/professional-practice.js"),html=read("professional-practice.html");
 assert.match(html,/id="new-case"[^>]*>Add New Case/);
 assert.match(js,/\$\("new-case"\)\.addEventListener\("click",\(\)=>navigateWorkflow\(2,/);
 assert.match(js,/navigateWorkflow\(id==="case-intake"\?2:1/);
 assert.match(js,/if\(routeStep===2&&routeClient\)sharedIntake=/);
 assert.match(js,/picker\.addEventListener\("change",\(\)=>navigateWorkflow\(2,/);
 assert.match(js,/\$\("case-save"\)\.disabled=!routeClient/);
 assert.match(js,/Add a new client in Step 1/);
});

test("professional packet mirrors the consumer sections without consumer account scripts",()=>{
 const js=read("js/professional-practice.js"),consumer=read("packet.html"),css=read("assets/professional-modern.css"),html=read("professional-packet.html");
 const headings=["Eligibility Status","Intake Summary","All Saved Offenses","Generate Packet"];
 let previous=-1;
 for(const heading of headings){assert.ok(consumer.includes(heading));const pos=js.indexOf('packetCard("'+heading+'")');assert.ok(pos>previous);previous=pos;}
 for(const label of ["Relief Type","Required Waiting Period","Estimated Eligible Date","RecordWatch background tracking","Missing requirements","Selected Record","Residence State","Current packet record"])assert.ok(js.includes(label));
 assert.match(js,/row\.record_details\.charges/);
 assert.match(js,/charge\.final_disposition/);
 assert.match(js,/client\.line2/);
 assert.match(js,/watchEnabled\?"Enabled":"Not activated"/);
 assert.match(css,/\.professional-date-grid\{display:grid;grid-template-columns:repeat\(4/);
 assert.match(css,/\.professional-summary-grid/);
 assert.doesNotMatch(html,/js\/user-store\.js/);
});
