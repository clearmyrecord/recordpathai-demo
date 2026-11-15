import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const packet=source("packet.html");
const watcher=source("recordwatch-dashboard.html");
const dashboard=source("dashboard.html");
const landing=source("recordwatch.html");
const intake=source("recordwatch-intake.html");
const relief=source("recordwatch-relief.html");
const notification=source("js/recordwatch-notifications.js");
const store=source("js/user-store.js");
const server=source("server.js");
const contact=source("js/packet-contact.js");
const context=vm.createContext({});
vm.runInContext(contact,context);
const fieldMapper=context.RecordPathPacketContact;

test("packet prefill is limited to account-owned Supabase profile and case",()=>{
  assert.match(store,/async function getSupabaseProfile\(\)/);
  assert.match(store,/async function getSupabaseCases\(\)/);
  assert.match(store,/async function getSupabaseCaseById\(caseId\)/);
  assert.match(store,/\.eq\("user_id",auth\.data\.user\.id\)/);
  assert.match(packet,/await Promise\.all\(\[\s*store\.getSupabaseProfile\(\),store\.getSupabaseCases\(\)/);
  assert.match(packet,/getSupabaseCaseById\(caseId\)/);
  const reader=packet.slice(packet.indexOf("function readPacketData()"),packet.indexOf("function formatDateForDisplay"));
  assert.match(reader,/accountPacketSnapshot/);
  assert.doesNotMatch(reader,/localStorage|loadPacketData\(/);
  assert.doesNotMatch(packet,/RecordPathDataBridge\.initPage\(document\)/);
  assert.doesNotMatch(packet,/RecordWatchBridge\.getRecordWatchSummary\(/);
});
test("browser contact, stale account user and another user never populate the packet",()=>{
  const browser={meta:{packet_contact_user_id:"owner-1"},petitioner:{
    full_name:"Wrong Applicant",email:"browser@example.org",phone:"9999999999",
    address:{line1:"Not Supabase Street",city:"Wrong City",state:"CA",zip:"90000"}
  }};
  const profile={id:"owner-1",full_name:"Saved Applicant",email:"saved@example.org",
    mailing_line1:"Verified Street",mailing_city:"Henderson",mailing_state:"NV",mailing_zip:"89012"};
  const got=fieldMapper.mergeForAccount(browser,profile,{id:"owner-1",email:"metadata@example.org"});
  assert.equal(got.fullName,"Saved Applicant");
  assert.equal(got.street,"Verified Street");
  assert.equal(got.email,"saved@example.org");
  const blank=fieldMapper.mergeForAccount(browser,null,{id:"owner-1",email:"metadata@example.org"});
  assert.equal(blank.fullName,"");
  assert.equal(blank.street,"");
  assert.equal(blank.email,"");
});
test("packet requires durable Supabase update and readback before rendering",()=>{
  const prepare=packet.slice(packet.indexOf("async function persistPacketContactForReview()"),packet.indexOf("function readPacketData()"));
  assert.match(prepare,/\.from\("profiles"\)/);
  assert.match(prepare,/\.eq\("id",user\.id\)\.select\("\*"\)\.single\(\)/);
  assert.match(prepare,/mergeForAccount\(null,result\.data,null\)/);
  assert.match(prepare,/RecordPathPacketContact\.validate\(savedValues\)/);
  assert.doesNotMatch(prepare,/localStorage\.setItem/);
  const submit=packet.slice(packet.indexOf("async function prepareSignedReviewPdf()"),packet.indexOf("async function generateSealingPdf()"));
  assert.ok(submit.indexOf("await persistPacketContactForReview()") <
    submit.indexOf("renderSignedCourtPdfBytes(data,selected)"));
});
test("RecordWatch dashboard rejects browser cases and checklist tasks",()=>{
  assert.match(watcher,/store\.getSupabaseCases\(\),store\.getSupabaseProfile\(\)/);
  assert.match(watcher,/from\("recordwatch_case_tasks"\)/);
  assert.match(watcher,/\.upsert\(\{user_id:user\.id,saved_case_id:caseId/);
  assert.doesNotMatch(watcher,/RecordWatchMonitor\.loadCases\(/);
  assert.doesNotMatch(watcher,/RecordWatchMonitor\.loadProfile\(/);
  assert.doesNotMatch(watcher,/RecordWatchMonitor\.getCaseTasks\(/);
  assert.doesNotMatch(watcher,/RecordWatchMonitor\.updateTask\(/);
  assert.doesNotMatch(watcher,/RecordWatchBridge\.syncExistingRecordPathData\(/);
});
test("account dashboard, enrollment, intake and relief use Supabase case records",()=>{
  for(const [name,page] of [["dashboard",dashboard],["enrollment",landing],
    ["intake",intake],["relief",relief]]){
    assert.match(page,/getSupabaseCases\(/,name+" must load from Supabase");
    assert.doesNotMatch(page,/RecordWatchMonitor\.loadCases\(/);
    assert.doesNotMatch(page,/RecordWatchBridge\.syncExistingRecordPathData\(/);
  }
  assert.doesNotMatch(intake,/localStorage/);
  assert.doesNotMatch(landing,/localStorage/);
  assert.doesNotMatch(relief,/RecordWatchMonitor\.updateTask\(/);
});
test("legacy RecordWatch API must fail closed rather than serve memory when Supabase is unavailable",()=>{
  const events=server.slice(server.indexOf('app.get("/api/recordwatch/subscriptions"'),
    server.indexOf('app.post("/api/recordwatch/preferences"'));
  assert.match(events,/res\.status\(503\)/);
  assert.doesNotMatch(events,/recordwatchMemory\.subscriptions\.filter/);
  assert.doesNotMatch(events,/getMemoryPreferences\(userId\)/);
  assert.match(notification,/remoteSnapshot=\{userId:"",ready:false/);
  const sync=notification.slice(notification.indexOf("async function fetchRemoteData(userId)"),
    notification.indexOf("function registerSubscription(payload)"));
  assert.doesNotMatch(sync,/readJSON\(|writeJSON\(|localStorage/);
  assert.match(sync,/result\.source!=="supabase"/);
});
test("task state persists with owner-only RLS and specific saved case",()=>{
  const sql=source("supabase/migrations/20261115030000_recordwatch_account_tasks.sql");
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/TO authenticated/);
  assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/sc\.id=saved_case_id/);
  assert.match(sql,/PRIMARY KEY \(user_id,saved_case_id,task_key\)/);
});
