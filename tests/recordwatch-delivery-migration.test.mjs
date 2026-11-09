import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261108040000_recordwatch_premium_delivery.sql", import.meta.url),
  "utf8"
);

test("Premium alert migration is one coherent, nonduplicated SQL script", () => {
  for (const sql of [
    "create table if not exists public.recordwatch_alert_deliveries",
    "create table if not exists public.recordwatch_sms_suppressions",
    "create table if not exists public.recordwatch_alert_migration_receipts",
    "insert into public.recordwatch_alert_migration_receipts"
  ]) {
    assert.equal(migration.split(sql).length - 1, 1, `Expected one occurrence of: ${sql}`);
  }
  assert.doesNotMatch(migration, /\n\),\s*\n\s*opted_out_at\s+timestamptz/);
  assert.match(migration.trimEnd(), /on conflict\(id\) do nothing;$/);
});

test("Premium alert delivery requires server-side authorization and no browser writes", () => {
  assert.match(migration, /unique\(saved_case_id,kind,channel,eligibility_date,reminder_on\)/);
  assert.match(migration, /alter table public\.recordwatch_sms_suppressions enable row level security;/);
  assert.match(migration, /alter table public\.recordwatch_alert_deliveries enable row level security;/);
  assert.match(migration, /revoke all on public\.recordwatch_sms_suppressions,public\.recordwatch_alert_deliveries\s+from public,anon,authenticated;/);
  assert.match(migration, /revoke insert,update,delete on public\.recordwatch_notification_preferences\s+from anon,authenticated;/);
});
