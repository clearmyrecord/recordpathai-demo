import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("Wood County campaign explains separate service and court charges and gives a free option",()=>{
 const page=read("wood-county.html");
 assert.match(page,/\$50/);assert.match(page,/\$0 court filing fee/);assert.match(page,/\$150/);
 assert.match(page,/No purchase required/);assert.match(page,/Not a court, law firm or government program/);
 assert.match(page,/href="eligibility.html"/);assert.match(page,/Ohio Legal Help/);
 assert.match(page,/Email filing for no-fee cases is not offered as a confirmed service/);
 assert.match(read("sitemap.xml"),/https:\/\/recordpathai\.com\/wood-county\.html/);
});
test("campaign attribution stays on the public page, with fixed values and no applicant identifiers",()=>{
 const script=read("js/wood-county-campaign.js");
 assert.match(script,/credentials:"omit"/);
 assert.match(script,/referrerPolicy:"no-referrer"/);
 assert.match(script,/allowed\.has\(param\)/);
 assert.match(script,/JSON\.stringify\(\{channel,event\}\)/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|gtag|document\.cookie/);
 const server=read("server.js");
 const start=server.indexOf('app.post("/api/marketing/wood-county/event"');
 const route=server.slice(start,server.indexOf("function publicSupabaseConfig",start));
 assert.ok(start>=0);
 assert.match(route,/Object\.keys\(body\)\.length!==2/);
 assert.match(route,/channels\.has\(body\.channel\)/);
 assert.match(route,/events\.has\(body\.event\)/);
 assert.match(route,/channel:body\.channel,event:body\.event/);
 assert.doesNotMatch(route,/req\.ip|req\.headers|supabaseRest|stripe\./);
});
