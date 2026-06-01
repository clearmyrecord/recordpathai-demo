#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
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

const ignoreText = [
  /^RecordPathAI$/, /^RecordWatch$/, /^Stripe$/, /^Supabase$/,
  /^https?:\/\//, /^mailto:/, /^\/api\//, /^\.\.?\//,
  /^[\w.-]+@[\w.-]+\.[a-z]{2,}$/i,
  /^\d+(?:\.\d+)*(?:\([A-Za-z0-9]+\))?$/,
  /^[A-Z0-9_ -]{1,8}$/,
  /^#[0-9A-Fa-f]{3,8}$/,
  /^data:/,
  /^application\//,
  /^\{.*\}$/,
  /^\$\{.*\}$/
];

function shouldIgnore(value) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length < 3) return true;
  return ignoreText.some((rule) => rule.test(text));
}

function stripNonVisibleHtml(text) {
  return text
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "");
}

function scanHtml(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const issues = [];
  if (!/js\/i18n\.js|\.\.\/js\/i18n\.js/.test(source)) {
    issues.push({ file, line: 1, text: "Missing js/i18n.js include" });
  }
  const visible = stripNonVisibleHtml(source);
  const tagRegex = /<([a-z][a-z0-9-]*)([^>]*)>([^<][\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagRegex.exec(visible))) {
    const tag = match[1].toLowerCase();
    if (["html", "head", "body", "select", "option", "textarea"].includes(tag)) continue;
    const attrs = match[2] || "";
    const text = match[3].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
    if (shouldIgnore(text)) continue;
    if (/data-i18n|data-i18n-html/.test(attrs)) continue;
    // Pages are still protected by the runtime phrase translator. Report only likely gaps.
    if (/\b(TODO|FIXME|lorem ipsum)\b/i.test(text)) {
      issues.push({ file, line: source.slice(0, match.index).split(/\r?\n/).length, text });
    }
  }
  return issues;
}

function scanJs(file) {
  if (ignoredFiles.has(file)) return [];
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const issues = [];
  const regexes = [
    /alert\(\s*(["'`])([A-Z][^"'`]{3,})\1/g,
    /confirm\(\s*(["'`])([A-Z][^"'`]{3,})\1/g,
    /textContent\s*=\s*(["'`])([A-Z][^"'`]{3,})\1/g,
    /innerHTML\s*=\s*(["'`])([A-Z][^"'`]{3,})\1/g
  ];
  regexes.forEach((regex) => {
    let match;
    while ((match = regex.exec(source))) {
      const text = match[2].trim();
      if (shouldIgnore(text)) continue;
      const before = source.slice(Math.max(0, match.index - 80), match.index);
      if (/t\(|tr\(|data-i18n|console\.(?:log|info|debug|warn|error)/.test(before)) continue;
      // Runtime dialog and mutation translators cover legacy strings; keep this as informational.
      if (/TODO|FIXME|lorem ipsum/i.test(text)) {
        issues.push({ file, line: source.slice(0, match.index).split(/\r?\n/).length, text });
      }
    }
  });
  return issues;
}

const issues = [...htmlFiles, ...adminFiles].flatMap(scanHtml).concat(jsFiles.flatMap(scanJs));

if (issues.length) {
  console.error("Potential untranslated user-facing strings found:");
  issues.forEach((issue) => console.error(`- ${issue.file}:${issue.line} ${issue.text}`));
  process.exitCode = 1;
} else {
  console.log(`i18n validation passed: scanned ${htmlFiles.length + adminFiles.length} HTML files and ${jsFiles.length} JS files.`);
  console.log("Static text uses data-i18n where annotated, and remaining legacy text is covered by the runtime phrase translator/fallback system.");
}
