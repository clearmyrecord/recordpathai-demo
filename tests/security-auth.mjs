import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../js/recordwatch-notifications.js", import.meta.url), "utf8");

const protectedRoutes = [
  ["post", "subscribe"], ["get", "subscriptions"], ["post", "eligibility-event"],
  ["get", "events"], ["get", "notifications"], ["get", "preferences"],
  ["post", "preferences"], ["post", "court-status"]
];

for (const [method, path] of protectedRoutes) {
  test(`RecordWatch ${method.toUpperCase()} ${path} requires authentication`, () => {
    const marker = `app.${method}("/api/recordwatch/${path}", async (req, res) => {`;
    const start = server.indexOf(marker);
    assert.ok(start >= 0, "route missing: " + marker);
    const body = server.slice(start + marker.length, start + marker.length + 400);
    assert.match(body, /await requireApiUser\(req, res\)/);
    assert.match(body, /if \(!authorizedUser\) return/);
  });
}

test("scheduled job requires admin authorization", () => {
  const marker = 'app.post("/api/recordwatch/run-daily", async (req, res) => {';
  const start = server.indexOf(marker);
  assert.ok(start >= 0);
  assert.match(server.slice(start, start + 260), /!isAdminRequest\(req\)/);
});

test("browser sends bearer token and cannot trigger daily job", () => {
  assert.match(client, /Authorization: "Bearer " \+ token/);
  assert.doesNotMatch(client, /post\("\/api\/recordwatch\/run-daily"/);
});

test("server does not serve internal source or demo admin bypass", () => {
  assert.match(server, /blockedFiles = new Set/);
  assert.doesNotMatch(server, /process\.env\.RECORDWATCH_DEMO_ADMIN === "true"/);
});
