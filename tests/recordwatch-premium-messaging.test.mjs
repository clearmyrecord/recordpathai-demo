import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const server = read("server.js");
const client = read("js/recordwatch-notifications.js");
const landing = read("recordwatch.html");
const account = read("account.html");
const dashboard = read("dashboard.html");
const premium = read("recordwatch-dashboard.html");

test("All outbound RecordWatch email and SMS are paid-case only, even with admin override", () => {
  const guardStart = server.indexOf("function shouldSendChannel(");
  const guardEnd = server.indexOf("\nfunction recordwatchSubject(", guardStart);
  assert.ok(guardStart >= 0 && guardEnd > guardStart);
  const guard = server.slice(guardStart, guardEnd);
  assert.match(guard, /channel === "email" \|\| channel === "sms"/);
  assert.match(guard, /subscription\.premium_active !== true\) return false/);
  assert.ok(guard.indexOf('subscription.premium_active !== true') < guard.indexOf('adminOverride ||'));
});

test("Each notification re-checks server-paid entitlement, preference and SMS consent", () => {
  const start = server.indexOf("async function createRecordwatchNotification(");
  const end = server.indexOf("\nfunction notificationAlreadyExists(", start);
  assert.ok(start >= 0 && end > start);
  const body = server.slice(start, end);
  assert.match(body, /getRecordwatchLifetimeCase\(subscription\.user_id,subscription\.case_id\)/);
  assert.match(body, /getActiveRecordwatchSubscription\(subscription\.user_id\)/);
  assert.match(body, /authorizedPremium=lifetimeCaseEntitled/);
  assert.match(body, /casePremiumPreferences\?\.sms_consent_at/);
  assert.match(body, /casePremiumPreferences\?\.sms_opted_out_at/);
  assert.match(body, /const caseEmailOptIn=Boolean\(authorizedPremium/);
  assert.match(body, /if \(externalAllowed && authorizedPremium && paidCaseSubscription\.notify_email/);
  assert.match(body, /if \(externalAllowed && authorizedPremium && paidCaseSubscription\.notify_sms/);
  assert.match(body, /shouldSendChannel\(/);
});

test("Public enrollment cannot grant local or server Premium email/SMS", () => {
  assert.match(server, /const planType = "free"/);
  assert.match(server, /notify_email: false,\s*notify_sms: false/);
  assert.match(client, /var premiumActive = false/);
  assert.match(client, /notify_email: false,\s*notify_sms: false/);
  assert.match(client, /var channels = \["in_app"\]/);
  assert.doesNotMatch(client, /channels\.push\("email"\)/);
  assert.doesNotMatch(client, /channels\.push\("sms"\)/);
});

test("Public website does not promise free email or SMS or allow free opt-in", () => {
  assert.match(landing, /<h3>Free Case Tracking<\/h3>/);
  assert.match(landing, /No email or SMS notifications/);
  assert.match(landing, /Email reminders and updates/);
  assert.match(landing, /SMS alerts \(with express consent/);
  assert.match(landing, /id="recordwatchNotifyEmail" type="checkbox" disabled/);
  assert.match(landing, /id="recordwatchNotifySms" type="checkbox" disabled/);
  assert.doesNotMatch(landing, /Free RecordWatch is active with email reminders/);
  assert.doesNotMatch(dashboard, /Free email reminders active/);
  assert.match(dashboard, /Email \+ SMS: Premium only/);
  assert.match(premium, /Email \+ SMS require Premium/);
  assert.match(account, /setPaidNotificationControls\(verifiedPremium\)/);
  assert.match(account, /input\.disabled = !premium/);
});
