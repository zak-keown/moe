#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const cwd = process.cwd();
const staging = arg("staging", ".moe/docs-verify");
const out = arg("out", "DOCS-VERIFY-REPORT.md");

const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd,
  encoding: "utf8",
}).trim();

const today = new Date().toISOString().slice(0, 10);

const allFindings = [];
const docTypes = [];

for (const f of readdirSync(staging).filter((n) => n.endsWith(".json")).sort()) {
  const type = f.replace(/\.json$/, "");
  docTypes.push(type);
  const items = JSON.parse(readFileSync(join(staging, f), "utf8"));
  for (const item of items) {
    // Normalize casing so a producer emitting e.g. "Critical" is grouped
    // and rendered the same as "critical" — a finding assigned an id and
    // counted in the total must not silently disappear from the body
    // because its severity was spelled with different casing.
    const severity = typeof item.severity === "string" ? item.severity.toLowerCase() : item.severity;
    allFindings.push({ ...item, severity, docType: type });
  }
}

allFindings.sort((a, b) => (RANK[a.severity] ?? 99) - (RANK[b.severity] ?? 99));

let id = 1;
for (const f of allFindings) {
  f.id = `DV-${String(id++).padStart(3, "0")}`;
}

const counts = { critical: 0, high: 0, medium: 0, low: 0 };
for (const f of allFindings) {
  if (f.severity in counts) counts[f.severity]++;
}
const total = allFindings.length;
const status = total > 0 ? "issues_found" : "clean";

const lines = [];
lines.push("---");
lines.push("report: docs-verify");
lines.push(`generated: ${today}`);
lines.push(`base_sha: ${sha}`);
lines.push(`doc_types_checked: [${docTypes.join(", ")}]`);
lines.push(
  `findings: { critical: ${counts.critical}, high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}, total: ${total} }`,
);
lines.push(`status: ${status}`);
lines.push("---");
lines.push("");

const project = cwd.split("/").pop();
lines.push(`# Documentation Verification — ${project}`);
lines.push("");
lines.push("## Coverage");
lines.push(`Checked ${docTypes.length} doc type(s): ${docTypes.join(", ")}.`);
lines.push("");

for (const sev of ["critical", "high", "medium", "low"]) {
  const group = allFindings.filter((f) => f.severity === sev);
  lines.push(`## ${sev.charAt(0).toUpperCase() + sev.slice(1)}`);
  if (group.length === 0) {
    lines.push("No findings.");
    lines.push("");
    continue;
  }
  for (const f of group) {
    lines.push(`### ${f.id}: ${f.actual.slice(0, 60)}`);
    lines.push(`**File:** \`${f.file}\``);
    lines.push(`**Anchor:** \`${f.anchor}\``);
    lines.push(`**Severity:** ${f.severity}`);
    lines.push(`**Type:** ${f.type}`);
    lines.push(f.actual);
    lines.push("");
  }
}

writeFileSync(join(cwd, out), lines.join("\n"));
