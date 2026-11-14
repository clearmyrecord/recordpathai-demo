import test from "node:test";
import assert from "node:assert/strict";
import {invokePremiumAlertRun} from "../tools/recordwatch-daily-runner.mjs";
const KEY="a".repeat(64);
const OK={ok:true,cases_checked:0,provider_accepted:0,already_reserved:0,skipped:0,failed_review:0,more_cases_possible:false};
test("short or missing scheduler keys never touch network",async()=>{await assert.rejects(
 invokePremiumAlertRun({key:"bad",fetchFn:()=>{throw Error("forbidden")}}),/scheduler key is missing/);});
test("fixed HTTPS endpoint and secret header only, no arbitrary recipients",async()=>{
 let calls=0;
 const out=await invokePremiumAlertRun({key:KEY,signal:null,fetchFn:async(url,opts)=>{
  calls++;assert.equal(url,"https://recordpathai-rtcqidw3qa-uw.a.run.app/api/operator/recordwatch/run-alerts");
  assert.equal(opts.method,"POST");assert.equal(opts.headers["x-recordwatch-alerts-key"],KEY);
  assert.equal(opts.body,"{}");return {ok:true,json:async()=>OK};}});
 assert.equal(calls,1);assert.equal(out.cases_checked,0);assert.equal(out.provider_accepted,0);});
test("trims a trailing newline from a Secret Manager key before sending the HTTP header",async()=>{
 const keyWithNewline=KEY+"\n";
 let seen="";
 await invokePremiumAlertRun({key:keyWithNewline,signal:null,fetchFn:async(url,opts)=>{
  seen=opts.headers["x-recordwatch-alerts-key"];return {ok:true,json:async()=>OK};
 }});
 assert.equal(seen,KEY);
});
test("rejects unauthorized, non-success and malformed worker responses",async()=>{
 await assert.rejects(invokePremiumAlertRun({key:KEY,signal:null,fetchFn:async()=>({ok:false,status:403})}),/HTTP 403/);
 await assert.rejects(invokePremiumAlertRun({key:KEY,signal:null,fetchFn:async()=>({ok:true,json:async()=>({ok:true})})}),/missing required counters/);
});
test("surfaces 1,000-case pagination block",async()=>{await assert.rejects(
 invokePremiumAlertRun({key:KEY,signal:null,fetchFn:async()=>({ok:true,json:async()=>({...OK,more_cases_possible:true})})}),/pagination required/);});
