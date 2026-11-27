import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("professional workspace is restricted to the staging project and requires AAL2",()=>{
 const js=read("js/professional-workspace.js");
 assert.match(js,/stagingHost="ckrqmlnckhagskpumjbh\.supabase\.co"/);
 assert.match(js,/new URL\(config.url\).hostname!==stagingHost/);
 assert.match(js,/aal.currentLevel!=="aal2"/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|\.innerHTML\s*=|stripe|lobCheck/);
});
test("synthetic-only staging schema restricts grants and requires attorney review",()=>{
 const sql=read("sql/professional-pilot-staging.sql");
 for(const name of ["orgs","members","matters","reviews"])assert.match(sql,new RegExp("alter table public.professional_pilot_"+name+" enable row level security"));
 assert.match(sql,/grant insert\(org_id,scenario\)/);
 assert.match(sql,/grant insert\(org_id,matter_id,decision\)/);
 assert.match(sql,/m.role='attorney' and m.attorney_verified and m.active/);
 assert.match(sql,/c.scenario<>'mixed' or decision='needs_review'/);
 assert.doesNotMatch(sql,/grant\s+[^;]*(update|delete)[^;]*to authenticated/i);
 assert.doesNotMatch(sql,/social_security|ssn|client_name|birth_date/i);
});
test("workspace does not solicit actual client information or payment",()=>{
 const html=read("professional-workspace.html");
 assert.match(html,/fictional cases only/);
 assert.match(html,/No real client information/);
 assert.doesNotMatch(html,/<input|<textarea|<form\b/i);
});
