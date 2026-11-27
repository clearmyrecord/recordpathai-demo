import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("professional registration uses production auth and real verification request, not local data",()=>{
 const js=read("js/professional-account.js"),html=read("professional-account.html"),landing=read("professional.html");
 assert.match(js,/https:\/\/pfyxjhdlqgpzzzdssqpk\.supabase\.co/);
 assert.match(js,/getAuthenticatorAssuranceLevel/);
 assert.match(js,/mfa\.challenge/);
 assert.match(js,/mfa\.verify/);
 assert.match(js,/professional_access_requests"\)\.insert/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|\.innerHTML/);
 assert.match(html,/Do not enter any client or case information/);
 assert.match(landing,/href="professional-account.html">Create professional account/);
});
test("real application cannot self-approve, change ownership or bypass MFA; client access remains held",()=>{
 const sql=read("sql/professional-access-production.sql"),base=read("sql/professional-production-foundation.sql");
 assert.match(sql,/enable row level security/);
 assert.match(sql,/user_id=\(select auth.uid\(\)\)/);
 assert.match(sql,/status='pending'/);
 assert.match(sql,/auth.jwt\(\)->>'aal'\)='aal2'/);
 assert.doesNotMatch(sql,/grant\s+[^;]*(update|delete)[^;]*to authenticated/i);
 assert.match(base,/professional_real_intake_release_hold check \(client_intake_enabled=false\)/);
});
