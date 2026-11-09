import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../recordwatch-dashboard.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");

test("RecordWatch dashboard does not use enrollment's two-column grid for independent panels", () => {
  assert.match(css, /\.recordwatch-enrollment-card,\s*\.recordwatch-widget\s*\{\s*display:\s*grid/);
  assert.match(css, /\.recordwatch-dashboard-page \.recordwatch-widget\s*\{\s*display:\s*block/);
  assert.match(css, /\.recordwatch-dashboard-page \.recordwatch-widget h2\s*\{[^}]*font-size:\s*clamp\(24px/);
});

test("Upcoming Premium reminders are grouped with compact labels and responsive layout", () => {
  assert.match(dashboard, /recordwatch-section-heading/);
  assert.match(dashboard, /recordwatch-schedule-grid/);
  assert.match(dashboard, /recordwatch-schedule-group/);
  assert.match(dashboard, /recordwatch-schedule-list/);
  assert.match(dashboard, /Eligibility countdown/);
  assert.match(dashboard, /Additional notifications/);
  for(const milestone of ["180 days","90 days","30 days","7 days","Day of"]){
    assert.ok(dashboard.includes(milestone), "Missing reminder milestone: " + milestone);
  }
  assert.match(css, /\.recordwatch-dashboard-page \.recordwatch-schedule-grid\s*\{\s*display:\s*grid/);
  assert.match(css, /@media \(max-width: 760px\) \{\s*\.recordwatch-dashboard-page \.recordwatch-schedule-grid\s*\{\s*grid-template-columns:\s*1fr/);
});

test("Free RecordWatch reminder preview does not promise delivery", () => {
  assert.match(dashboard, /These are Premium features, not scheduled free alerts/);
  assert.match(dashboard, /Email delivery depends on the configured provider/);
  assert.match(dashboard, /supported court integration/);
  assert.match(dashboard, /recordwatch-history-list/);
});
