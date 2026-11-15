import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {alertKindEnabled,alertPreferenceField,packetFollowupsForCase,
        recentVerifiedCourtEvent,daysAfter} from "../src/recordwatch-supplemental-alerts.js";
import {neutralAlertContent,reminderForDate} from "../src/recordwatch-alerts.js";
const load=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const server=load("server.js");
const dashboard=load("recordwatch-dashboard.html");
const sql=load("supabase/migrations/20261115010000_recordwatch_supplemental_alerts.sql");
const created="2026-11-01T16:00:00Z";
const full={id:"case1",created_at:created,case_number:"A",court_name:"B",primary_charge:"C",outcome:"D",packet_status:"not_generated"};

test("all five exact eligibility milestones and per-case flags are honored",()=>{
  for(const [days,kind,flag] of [
    [180,"eligibility_180_day","reminder_180_enabled"],
    [90,"eligibility_90_day","reminder_90_enabled"],
    [30,"eligibility_30_day","reminder_30_enabled"],
    [7,"eligibility_7_day","reminder_7_enabled"],
    [0,"eligibility_reached","reminder_day_enabled"]]){
    assert.equal(alertPreferenceField(kind),flag);
    const today="2026-11-15", target=new Date(Date.parse(today+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);
    assert.equal(reminderForDate(target,today)?.kind,kind);
    assert.equal(alertKindEnabled(kind,{[flag]:false}),false);
    assert.equal(alertKindEnabled(kind,{[flag]:true}),true);
    assert.equal(alertKindEnabled(kind,null),false);
  }
  assert.equal(reminderForDate("2020-01-01","2026-11-15"),null);
});

test("packet and missing-details followups trigger once on days 3, 7 and 14 only",()=>{
  for(const days of [3,7,14]){
    const today=new Date(Date.parse("2026-11-01T00:00:00Z")+days*86400000).toISOString().slice(0,10);
    assert.deepEqual(packetFollowupsForCase(full,today),
      [{kind:"packet_progress_"+days+"_day",date:"2026-11-01"}]);
    assert.deepEqual(packetFollowupsForCase({...full,outcome:null},today),
      [{kind:"missing_details_"+days+"_day",date:"2026-11-01"}]);
  }
  assert.deepEqual(packetFollowupsForCase(full,"2026-11-15"),
    [{kind:"packet_progress_14_day",date:"2026-11-01"}]);
  for(const days of [0,1,2,4,6,15,60]){
    const today=new Date(Date.parse("2026-11-01T00:00:00Z")+days*86400000).toISOString().slice(0,10);
    assert.deepEqual(packetFollowupsForCase(full,today),[]);
  }
  assert.deepEqual(packetFollowupsForCase({...full,packet_generated_at:"2026-11-02T00:00Z"},"2026-11-08"),[]);
  assert.deepEqual(packetFollowupsForCase({...full,deleted_at:"2026-11-04"},"2026-11-08"),[]);
  assert.deepEqual(packetFollowupsForCase({...full,recordwatch_paused_at:"2026-11-05"},"2026-11-08"),[]);
});

test("packet, missing-details and verified court notifications have independent opt-outs",()=>{
  for(const [kind,field] of [["packet_progress_3_day","packet_progress_enabled"],
    ["packet_progress_14_day","packet_progress_enabled"],
    ["missing_details_7_day","missing_details_enabled"],
    ["court_status_update","court_status_enabled"]]){
    assert.equal(alertPreferenceField(kind),field);
    assert.equal(alertKindEnabled(kind,{[field]:false}),false);
    assert.equal(alertKindEnabled(kind,{[field]:true}),true);
  }
  assert.equal(alertKindEnabled("arbitrary_kind",{court_status_enabled:true}),false);
});

test("court events require independent verified evidence, recency and immutable key",()=>{
  const event={event_key:"official-12345",verified_source:"operator_verified",
    occurred_on:"2026-11-13",verified_at:"2026-11-14T10:00:00Z",
    evidence_url:"https://example.gov/case"};
  assert.equal(recentVerifiedCourtEvent(event,"2026-11-15"),true);
  for(const modification of [
    {verified_source:"manual"},{evidence_url:""},{event_key:"bad"},
    {verified_at:"2026-11-01T10:00:00Z"},{occurred_on:"2026-11-30"}
  ])assert.equal(recentVerifiedCourtEvent({...event,...modification},"2026-11-15"),false);
  assert.equal(daysAfter("2026-11-14T10:00:00Z","2026-11-15"),1);
});

test("all outward messages omit criminal charges and details",()=>{
  for(const kind of ["eligibility_180_day","eligibility_reached",
    "packet_progress_3_day","missing_details_7_day","court_status_update"]){
    for(const channel of ["email","sms"]){
      const msg=neutralAlertContent(kind,channel);
      assert.match(msg.message,/Sign in/);
      assert.doesNotMatch(msg.message,/(?:arrest|felony|convict|charge|docket|expunge|seal)/i);
      if(channel==="sms")assert.match(msg.message,/Reply STOP/);
    }
  }
});

test("live scheduler enforces every category preference and uses immutable reservations",()=>{
  const live=server.slice(server.indexOf("async function sendCasePremiumAlert("),
    server.indexOf('app.post("/api/operator/recordwatch/run-alerts"'));
  assert.match(live,/alertKindEnabled\(kind,prefs\)/);
  assert.match(live,/verifyPremiumAlertPayment\(lifetime\)/);
  assert.match(live,/recordwatch_sms_suppressions/);
  assert.match(live,/resolution=ignore-duplicates/);
  assert.match(live,/on_conflict=saved_case_id,kind,channel,eligibility_date,reminder_on,source_event_key/);
  assert.match(live,/packetFollowupsForCase\(savedCase,today\)/);
  assert.match(live,/recentVerifiedCourtEvent\(event,today\)/);
  assert.match(live,/deleted_at=is.null&archived_at=is.null&recordwatch_paused_at=is.null/);
  assert.match(live,/recordwatchSupplementalMigrationReady/);
  assert.match(server,/if\(!requireOperationsKey\(req,res\)\)return;/);
  assert.match(server,/verified_source:"operator_verified"/);
  assert.match(server,/Independent official court evidence URL required/);
  assert.match(sql,/GRANT ALL ON public.recordwatch_verified_court_events TO service_role/);
  assert.match(sql,/ADD CONSTRAINT recordwatch_alert_deliveries_dedup_v2_key/);
});

test("paid case dashboard has real category controls and saves each flag",()=>{
  for(const id of ["premiumReminder180","premiumReminder90","premiumReminder30",
    "premiumReminder7","premiumReminderDay","premiumPacketProgress",
    "premiumMissingDetails","premiumCourtStatus"])assert.match(dashboard,new RegExp(id));
  assert.match(dashboard,/payload\[option.field\]=Boolean\(check && check.checked\)/);
  for(const name of ["packet_progress_enabled","missing_details_enabled",
    "reminder_day_enabled","court_status_enabled"])assert.match(server,new RegExp(name+":payload"));
});
