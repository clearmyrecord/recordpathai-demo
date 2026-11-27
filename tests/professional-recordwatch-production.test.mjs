import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("production professional RecordWatch preserves consent and independent event verification",()=>{
 const sql=read("sql/professional-recordwatch-production.sql");
 for(const t of ["professional_watch_enrollments","professional_watch_tasks","professional_verified_court_events","professional_watch_observations"])assert.match(sql,new RegExp("alter table public."+t+" enable row level security"));
 assert.match(sql,/e.enabled and e.consent_confirmed/);
 assert.match(sql,/America\/New_York/);
 assert.match(sql,/revoke all on function public.professional_refresh_watch_due\(\) from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant insert[^;]*professional_verified_court_events[^;]*to authenticated/);
 const schedule=read("sql/professional-recordwatch-production-schedule.sql");
 assert.match(schedule,/professional-watch-due-production/);
});
test("approved production practice includes reminders and official manual signing export but no automatic dispatch",()=>{
 const js=read("js/professional-practice.js"),renderer=read("js/professional-wood-draft.js");
 assert.match(js,/professional_watch_tasks/);
 assert.match(js,/No independently verified event recorded/);
 assert.match(js,/signatureReady:true/);
 assert.match(js,/I reviewed the official form and will obtain the required applicant signature/);
 assert.match(renderer,/signatureReady&&counsel/);
 assert.match(renderer,/signatureReady&&path==="generated.current_date"/);
 assert.match(renderer,/if\(!signatureReady\)for/);
 assert.match(js,/Wood County Clerk of Courts, One Courthouse Square/);
 assert.match(js,/Do not include a court-fee check/);
 assert.doesNotMatch(js,/\/api\/professional\/.*dispatch/);
});
