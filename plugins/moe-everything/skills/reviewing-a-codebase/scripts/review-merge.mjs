#!/usr/bin/env node
// Merge shard reports into CODEBASE-REVIEW.md, assigning the CR-### sequence.
//
// IDs are assigned HERE, once, rather than by each shard: a shard-local number
// collides with every other shard's, and a positional number renumbers the
// moment a finding is added, silently repointing every disposition stamped
// against it by `fixing-a-code-review`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const shardsDir = arg("shards", ".review-shards");
const out = arg("out", "CODEBASE-REVIEW.md");
const verified = process.argv.includes("--verified");
const manifest = JSON.parse(readFileSync(join(repo, shardsDir, "manifest.json"), "utf8"));

const RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const found = [];
const missing = [];
const malformed = [];
// Shard sections that are not findings but must survive the merge. Dropping
// them was a real defect: review-shard.md tells reviewers to write
// "Checked and found sound" with no **Severity:** line, and this merge used to
// discard exactly that, so the one section proving something was examined
// rather than skipped never reached the report.
const sound = [];

for (const shard of manifest.shards) {
  const p = join(repo, shard.report_path);
  if (!existsSync(p)) {
    missing.push(shard);
    continue;
  }
  const body = readFileSync(p, "utf8").replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n?/, "");
  const heads = [...body.matchAll(/^###\s+(.+)$/gm)];
  for (let i = 0; i < heads.length; i++) {
    const start = heads[i].index;
    const end = i + 1 < heads.length ? heads[i + 1].index : body.length;
    const block = body.slice(start, end).trim();
    const severityField = (block.match(/^\*\*Severity:\*\*\s*([^\n]+)/im) || [])[1]?.trim();
    const fileField = (block.match(/^\*\*File:\*\*\s*`?([^`\n]+)`?/im) || [])[1]?.trim();
    if (/^checked and found sound/i.test(heads[i][1])) {
      sound.push(block.replace(/^###\s+.+$/m, "").trim());
      continue;
    }
    // A heading with neither field is supplemental shard prose. A heading
    // with only one field (or an invented severity) is a malformed finding;
    // silently dropping it would make the merged report claim false coverage.
    if (!severityField && !fileField) continue;
    const sev = severityField?.toLowerCase();
    if (!fileField || !Object.hasOwn(RANK, sev)) {
      malformed.push({ report_path: shard.report_path, title: heads[i][1] });
      continue;
    }
    found.push({
      sev,
      file: fileField,
      group: shard.group,
      title: heads[i][1].replace(/^(?:CR-\d+|\d+)[.:]\s*/, "").trim(),
      block,
    });
  }
}

if (malformed.length) {
  process.stderr.write(
    `review-merge: ${malformed.length} malformed finding record(s) — refusing to omit them:\n` +
      malformed.map((f) => `  ${f.report_path}: ${f.title}`).join("\n") +
      "\nEach finding needs one **File:** field and a critical|high|medium|low **Severity:** field.\n",
  );
  process.exit(1);
}

// A missing shard is a smaller tree reported as a whole one. Refuse.
if (missing.length) {
  process.stderr.write(
    `review-merge: ${missing.length} shard report(s) missing — refusing to write a ` +
      `report that would understate coverage:\n` +
      missing.map((s) => `  ${s.report_path}`).join("\n") +
      `\nRe-run those shards, or delete them from manifest.json deliberately.\n`,
  );
  process.exit(1);
}

found.sort((a, b) => RANK[a.sev] - RANK[b.sev] || a.file.localeCompare(b.file));
found.forEach((f, i) => {
  f.id = `CR-${String(i + 1).padStart(3, "0")}`;
});

const count = (s) => found.filter((f) => f.sev === s).length;
const counts = { critical: count("critical"), high: count("high"), medium: count("medium"), low: count("low") };
const opened = manifest.shards.reduce((n, s) => n + s.files.length, 0);

const lines = [
  "---",
  "report: codebase-review",
  `generated: ${new Date().toISOString().slice(0, 10)}`,
  `base_sha: ${manifest.base_sha}`,
  `depth: ${manifest.depth}`,
  `denominator: ${manifest.denominator}`,
  `denominator_rule: ${JSON.stringify(manifest.denominator_rule)}`,
  `files_opened: ${opened}`,
  "findings:",
  `  critical: ${counts.critical}`,
  `  high: ${counts.high}`,
  `  medium: ${counts.medium}`,
  `  low: ${counts.low}`,
  `  total: ${found.length}`,
  `verified: ${verified}`,
  `status: ${found.length ? "issues_found" : "clean"}`,
  "---",
  "",
  `# Codebase Review — ${repo.split("/").pop()}`,
  "",
  "## Coverage",
  "",
  `**Denominator:** ${manifest.denominator} ${manifest.denominator_rule}.`,
  `**Opened:** ${opened} of ${manifest.denominator} counted files.`,
  ...(manifest.not_selected
    ? [`**In scope but not selected at this depth:** ${manifest.not_selected}.`]
    : []),
  ...(manifest.outside_denominator
    ? [
        `**Tracked but outside the denominator:** ${manifest.outside_denominator}` +
          (manifest.outside_denominator_areas?.length
            ? ` (under ${manifest.outside_denominator_areas.map((a) => `\`${a}\``).join(", ")})`
            : "") +
          ". These were not counted; say whether you read them.",
      ]
    : []),
  `**Base:** \`${manifest.base_sha}\`, depth \`${manifest.depth}\`.`,
  "",
  "Absence of findings in an unopened area is evidence nobody looked, not",
  "evidence it is clean.",
  "",
];

for (const sev of ["critical", "high", "medium", "low"]) {
  const rows = found.filter((f) => f.sev === sev);
  if (!rows.length) continue;
  lines.push(`## ${sev[0].toUpperCase()}${sev.slice(1)}`, "");
  for (const f of rows) {
    lines.push(f.block.replace(/^###\s+.+$/m, `### ${f.id}: ${f.title}`), "");
  }
}

if (sound.length) {
  lines.push("## Checked and found sound", "", ...sound.flatMap((s) => [s, ""]));
}

writeFileSync(join(repo, out), lines.join("\n"));
process.stdout.write(
  `${out}: ${found.length} finding(s) — ${counts.critical}C/${counts.high}H/${counts.medium}M/${counts.low}L, ` +
    `${opened}/${manifest.denominator} files opened.\n`,
);
