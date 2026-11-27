import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {professionalStagingReady,validateProfessionalSignedPdf,PROFESSIONAL_PDF_MAX} from "../src/professional-signed-review.js";
const bytes=Buffer.from("%PDF-1.7\n"+" ".repeat(600)+"\n%%EOF");
const address="Address Verification Personal Identifiers Name of Party PO Box Apartment Number";
const app="State of Ohio Case Judge Name of Offense Charge Offense Code Degree of Offense Respectfully Submitted";
const conv=app+" Application to Seal Record Conviction Applicant's";
const dismiss=app+" Dismissal Not Guilty Charges Were Dismissed";
test("staging guard denies production, mixed project and missing keys",()=>{
 const staging="https://ckrqmlnckhagskpumjbh.supabase.co",prod="https://pfyxjhdlqgpzzzdssqpk.supabase.co";
 assert.equal(professionalStagingReady({url:staging,key:"fixture"},{url:staging,anonKey:"fixture"}),true);
 for(const u of [prod,"http://ckrqmlnckhagskpumjbh.supabase.co","https://example.invalid"]){assert.equal(professionalStagingReady({url:u,key:"fixture"},{url:staging,anonKey:"fixture"}),false);assert.equal(professionalStagingReady({url:staging,key:"fixture"},{url:u,anonKey:"fixture"}),false);}
});
test("PDF validation requires official disposition-specific forms and exact SHA",async()=>{
 const hash=createHash("sha256").update(bytes).digest("hex");
 assert.equal(await validateProfessionalSignedPdf(bytes,"conviction",async()=>[address,conv]),hash);
 assert.equal(await validateProfessionalSignedPdf(bytes,"not_guilty",async()=>[address,dismiss]),hash);
 for(const [outcome,pages] of [["conviction",[address,dismiss]],["dismissal",[address,conv]],["mixed",[address,dismiss]],["dismissal",[address,dismiss+" UNSIGNED REVIEW DRAFT - DO NOT FILE"]],["conviction",[address,conv,"extra"]]])await assert.rejects(validateProfessionalSignedPdf(bytes,outcome,async()=>pages));
 await assert.rejects(validateProfessionalSignedPdf(Buffer.alloc(PROFESSIONAL_PDF_MAX+1),"conviction",async()=>[address,conv]));
});
test("migration keeps raw bytes private and applies the exact review gate",()=>{
 const sql=readFileSync(new URL("../sql/professional-signed-review-staging.sql",import.meta.url),"utf8");
 assert.doesNotMatch(sql,/insert into storage\.buckets/i);
 assert.match(sql,/encode\(sha256\(pdf_bytes\),'hex'\)=sha256/);
 assert.match(sql,/grant select\(id,org_id,case_id,attorney_id,sha256,page_count,attorney_signature_attested,created_at\)/);
 assert.match(sql,/event_type='manual_followup' or exists\(select 1 from public.professional_signed_reviews/);
 const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
 assert.ok(server.indexOf("registerProfessionalReviewRoutes(app,")<server.indexOf("app.use(express.json())"));
});
