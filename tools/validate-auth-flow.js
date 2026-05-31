import fs from "fs";
import path from "path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function scriptIndex(html, src) {
  return html.indexOf(`src="${src}"`);
}

function validateAuthPage(relativePath) {
  const html = read(relativePath);
  const requiredScripts = ["js/supabase-client.js", "js/user-store.js", "js/auth.js"];
  requiredScripts.forEach((src) => {
    if (scriptIndex(html, src) === -1) fail(`${relativePath} is missing ${src}`);
  });
  const indexes = requiredScripts.map((src) => scriptIndex(html, src));
  if (indexes.every((index) => index !== -1) && !(indexes[0] < indexes[1] && indexes[1] < indexes[2])) {
    fail(`${relativePath} must load supabase-client.js before user-store.js before auth.js`);
  }
  if (!html.includes("await RecordPathUserStore.ready")) fail(`${relativePath} must await RecordPathUserStore.ready before wiring auth actions`);
}

function listHtmlFiles(directory = ".") {
  const entries = fs.readdirSync(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const relativePath = path.join(directory, entry.name).replace(/^\.\//, "");
    if (entry.isDirectory()) files.push(...listHtmlFiles(relativePath));
    if (entry.isFile() && entry.name.endsWith(".html")) files.push(relativePath);
  }
  return files;
}

function countAuthUtilities(html) {
  return (html.match(/data-auth-utility/g) || []).length;
}

validateAuthPage("signup.html");
validateAuthPage("login.html");

for (const file of listHtmlFiles()) {
  const html = read(file);
  const hasHeader = /<header\b/i.test(html) || /class="[^"]*site-header/.test(html) || /header-shell-modern/.test(html);
  if (!hasHeader) continue;
  const count = countAuthUtilities(html);
  if (count !== 1) fail(`${file} has ${count} [data-auth-utility] markers; expected exactly one`);
}

const server = fs.existsSync(path.join(root, "server.js")) ? read("server.js") : "";
const serverlessEndpointExists = fs.existsSync(path.join(root, "api/config/supabase.js"));
const expressEndpointExists = server.includes('"/api/config/supabase"') || server.includes("'/api/config/supabase'");
if (!serverlessEndpointExists && !expressEndpointExists) {
  fail("/api/config/supabase endpoint is missing; add it or document RECORDPATH_SUPABASE_URL and RECORDPATH_SUPABASE_ANON_KEY deployment requirements");
}

const routeIndex = server.indexOf('/api/config/supabase');
const serverEndpointSource = routeIndex === -1 ? "" : server.slice(Math.max(0, routeIndex - 500), routeIndex + 500);
const endpointSource = [serverlessEndpointExists ? read("api/config/supabase.js") : "", serverEndpointSource].join("\n");
["RECORDPATH_SUPABASE_URL", "RECORDPATH_SUPABASE_ANON_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"].forEach((envName) => {
  if (!endpointSource.includes(envName)) fail(`/api/config/supabase does not reference ${envName}`);
});
if (/SERVICE_ROLE|SERVICE_ROLE_KEY|SUPABASE_SERVICE/i.test(endpointSource)) {
  fail("Public Supabase config endpoint must not expose or reference service-role keys");
}

if (failures.length) {
  console.error("Auth validation failed:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("Auth validation passed.");
