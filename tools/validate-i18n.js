#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith(".html"));
const jsFiles = fs.readdirSync(path.join(root, "js")).filter((file) => file.endsWith(".js")).map((file) => path.join("js", file));
const adminFiles = fs.existsSync(path.join(root, "admin"))
  ? fs.readdirSync(path.join(root, "admin")).filter((file) => file.endsWith(".html")).map((file) => path.join("admin", file))
  : [];

const ignoredFiles = new Set([
  "js/charge-library.js",
  "js/charges.js",
  "js/court-form-configs.js",
  "js/courts.js",
  "js/fingerprint-rules.js",
  "js/rules.js",
  "js/sealing-rules.js",
  "js/recordwatch-rules.js"
]);

const allowedText = [
  /^RecordPathAI$/i,
  /^RecordWatch$/i,
  /^Stripe$/i,
  /^Supabase$/i,
  /^https?:\/\//i,
  /^mailto:/i,
  /^\/api\//,
  /^\.\.?\//,
  /^[\w.-]+@[\w.-]+\.[a-z]{2,}$/i,
  /^\$?\d+(?:\.\d+)?(?:\s*(?:days?|years?|mapped fields|mapped fields filled))?$/i,
  /^\d+(?:\.\d+)*(?:\([A-Za-z0-9]+\))?$/,
  /^[A-Z0-9_ -]{1,8}$/,
  /^#[0-9A-Fa-f]{3,8}$/,
  /^data:/,
  /^application\//,
  /^\{.*\}$/,
  /^\$\{.*\}$/,
  /^[A-Z][a-z]+ County(?: Court(?: of Common Pleas)?)?$/,
  /(?:\.pdf|\.json|\.html|\.js)$/i,
  /\b(?:R\.C\.|O\.R\.C\.|NRS|G\.S\.)\s*\d/i
];

function normalize(value) {
  return String(value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function shouldIgnore(value) {
  const text = normalize(value);
  if (!text || text.length < 3) return true;
  if (!/[A-Za-z]/.test(text)) return true;
  return allowedText.some((rule) => rule.test(text));
}

function lineFor(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function stripNonVisibleHtml(text) {
  return text
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "");
}

function pushIssue(issues, file, source, index, kind, text, covered = false) {
  const value = normalize(text);
  if (shouldIgnore(value)) return;
  issues.push({ file, line: lineFor(source, index), kind, text: value, covered });
}

function scanHtml(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const issues = [];
  if (!/js\/i18n\.js|\.\.\/js\/i18n\.js/.test(source)) {
    issues.push({ file, line: 1, kind: "missing-runtime", text: "Missing js/i18n.js include", covered: false });
  }

  const visible = stripNonVisibleHtml(source);
  const tagRegex = /<([a-z][a-z0-9-]*)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagRegex.exec(visible))) {
    const tag = match[1].toLowerCase();
    if (["html", "head", "body", "script", "style", "noscript", "svg", "select", "option", "textarea"].includes(tag)) continue;
    const attrs = match[2] || "";
    if (/data-i18n|data-i18n-html|aria-hidden\s*=\s*["']true["']/i.test(attrs)) continue;
    const inner = match[3].replace(/<[^>]+>/g, " ");
    pushIssue(issues, file, source, match.index, "html-text-without-data-i18n", inner, true);
  }

  const attrRegex = /<([a-z][a-z0-9-]*)([^>]*\s(?:placeholder|title|aria-label|value)\s*=\s*(["'])(.*?)\3[^>]*)>/gi;
  while ((match = attrRegex.exec(source))) {
    const attrs = match[2] || "";
    const value = match[4];
    if (/data-i18n-(?:placeholder|title|aria-label|value)|data-language-selector/i.test(attrs)) continue;
    pushIssue(issues, file, source, match.index, "html-attribute-without-i18n-key", value, true);
  }
  return issues;
}

function scanJs(file) {
  if (ignoredFiles.has(file)) return [];
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const issues = [];
  const patterns = [
    { kind: "alert-hard-coded", regex: /\balert\(\s*(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g },
    { kind: "confirm-hard-coded", regex: /\bconfirm\(\s*(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g },
    { kind: "textContent-hard-coded", regex: /\.textContent\s*=\s*(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g },
    { kind: "innerHTML-hard-coded", regex: /\.innerHTML\s*=\s*(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g },
    { kind: "insertAdjacentHTML-hard-coded", regex: /\.insertAdjacentHTML\([^,]+,\s*(["'`])([\s\S]*?[A-Za-z][\s\S]*?)\1\s*\)/g },
    { kind: "setStatus-hard-coded", regex: /\bsetStatus\(\s*(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g },
    { kind: "setCheckoutError-hard-coded", regex: /\bsetCheckoutError\(\s*(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g },
    { kind: "placeholder-hard-coded", regex: /\.placeholder\s*=\s*(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g },
    { kind: "title-hard-coded", regex: /\.title\s*=\s*(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g },
    { kind: "aria-label-hard-coded", regex: /setAttribute\(\s*(["'])aria-label\1\s*,\s*(["'`])([^"'`]*[A-Za-z][^"'`]*)\2/g }
  ];

  patterns.forEach(({ kind, regex }) => {
    let match;
    while ((match = regex.exec(source))) {
      const text = kind === "aria-label-hard-coded" ? match[3] : match[2];
      const before = source.slice(Math.max(0, match.index - 120), match.index);
      if (/RecordPathI18n\.t|\bt\(|data-i18n|console\.(?:log|info|debug|warn|error)/.test(before)) continue;
      pushIssue(issues, file, source, match.index, kind, text.replace(/<[^>]+>/g, " "), true);
    }
  });
  return issues;
}

const htmlIssues = [...htmlFiles, ...adminFiles].flatMap(scanHtml);
const jsIssues = jsFiles.flatMap(scanJs);
const issues = htmlIssues.concat(jsIssues);
const uncovered = issues.filter((issue) => !issue.covered);

console.log(`i18n validation scanned ${htmlFiles.length + adminFiles.length} HTML files and ${jsFiles.length} JS files.`);
if (issues.length) {
  console.log(`Reported ${issues.length} likely user-facing hard-coded string locations; ${issues.length - uncovered.length} are covered by the runtime phrase/attribute translator.`);
  const sample = issues.slice(0, 30);
  sample.forEach((issue) => console.log(`- ${issue.file}:${issue.line} [${issue.kind}] ${issue.text}${issue.covered ? " (runtime-covered)" : ""}`));
  if (issues.length > sample.length) console.log(`...and ${issues.length - sample.length} more locations.`);
} else {
  console.log("No likely untranslated user-facing strings found.");
}

if (strict && issues.length) process.exitCode = 1;
else if (uncovered.length) process.exitCode = 1;
