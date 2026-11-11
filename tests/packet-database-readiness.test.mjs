import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const server=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
const start=server.indexOf('app.get("/api/operator/packet/database-readiness"');
const end=server.indexOf("// Explicit operator action only.",start);
assert.ok(start>0&&end>start);
const route=server.slice(start,end);
const migration=fs.readFileSync(new URL("../supabase/migrations/20261111000000_atomic_packet_lob_dispatch.sql",import.meta.url),"utf8");

test("packet migration readiness requires operator key and private DB",()=>{
  assert.match(route,/requireOperationsKey\(req,res\)/);
  assert.match(route,/packetDatabaseReady\(\)/);
  assert.match(route,/packet_releases:false/);
  assert.match(route,/packet_drafts:false/);
  assert.match(route,/packet_fulfillment_jobs:false/);
  assert.match(route,/Cache-Control/);
});
test("atomic SQL preflight can never match a chargeable live checkout session",()=>{
  assert.match(route,/rpc\/reserve_packet_lob_dispatch/);
  assert.match(route,/p_stripe_session_id:"cs_test_schema_preflight_NEVER_CHARGE"/);
  assert.match(migration,/p_stripe_session_id !~ '\^cs_live_\[A-Za-z0-9\]\+\$'/);
  assert.match(route,/Array\.isArray\(checked\)&&checked\.length===0/);
  assert.doesNotMatch(route,/stripe\.checkout|lob\.com|checkout\.sessions\.create/);
});
