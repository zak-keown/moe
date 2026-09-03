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
import {
  FRONTMATTER_RE,
  RANK,
  VERDICTS,
  findingFields,
  findingProblems,
  parseProvenance,
  splitSections,
} from "./review-report.mjs";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const shardsDir = arg("shards", ".moe/review-shards");
const out = arg("out", "CODEBASE-REVIEW.md");
if (process.argv.includes("--verified")) {
  process.stderr.write(
    "review-merge: --verified cannot prove anything; pass a complete --verification-results ledger\n",
  );
  process.exit(2);
}
const verificationResultsPath = arg("verification-results", "");
const manifest = JSON.parse(readFileSync(join(repo, shardsDir, "manifest.json"), "utf8"));
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
if (head !== manifest.base_sha) {
  process.stderr.write(
    `review-merge: HEAD ${head} does not match shard manifest base_sha ${manifest.base_sha}\n`,
  );
  process.exit(1);
}
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
  cwd: repo,
  encoding: "utf8",
}).trim();
if (dirty) {
  process.stderr.write(
    "review-merge: tracked working tree is dirty; shard provenance no longer identifies one tree\n",
  );
  process.exit(1);
}

const found = [];
const missing = [];
const malformed = [];
const provenanceFailures = [];
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
  const raw = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const provenance = parseProvenance(raw);
  if (!provenance) {
    provenanceFailures.push(`${shard.report_path}: missing shard provenance header`);
    continue;
  }
  if (provenance.base_sha !== manifest.base_sha) {
    provenanceFailures.push(
      `${shard.report_path}: base_sha ${provenance.base_sha} does not match ${manifest.base_sha}`,
    );
    continue;
  }
  if (provenance.files_opened !== shard.files.length) {
    provenanceFailures.push(
      `${shard.report_path}: files_opened ${provenance.files_opened} does not match assigned ${shard.files.length}`,
    );
    continue;
  }
  const body = raw.slice(provenance.length).replace(FRONTMATTER_RE, "");
  for (const section of splitSections(body)) {
    if (section.sound) {
      sound.push(section.block.replace(/^###\s+.+$/m, "").trim());
      continue;
    }
    // The checked-sound heading above is the only allowed non-finding. Any
    // other fieldless heading could be a real finding the merge would silently
    // erase, turning a shard with issues into a clean report.
    const problems = findingProblems(section.block, repo);
    if (problems.length) {
      malformed.push({ report_path: shard.report_path, title: section.title, problems });
      continue;
    }
    const { sev, file } = findingFields(section.block);
    found.push({
      sev,
      file,
      group: shard.group,
      title: section.title.replace(/^(?:CR-\d+|\d+)[.:]\s*/, "").trim(),
      block: section.block,
    });
  }
}

if (provenanceFailures.length) {
  process.stderr.write(
    `review-merge: ${provenanceFailures.length} shard provenance failure(s):\n` +
      provenanceFailures.map((failure) => `  ${failure}`).join("\n") +
      "\n",
  );
  process.exit(1);
}

if (malformed.length) {
  process.stderr.write(
    `review-merge: ${malformed.length} malformed finding record(s) — refusing to omit them:\n` +
      malformed.map((f) => `  ${f.report_path}: ${f.title} (${f.problems.join("; ")})`).join("\n") +
      "\nEach finding needs a repository-relative **File:** that exists, a stable **Anchor:** field, and a critical|high|medium|low **Severity:** field.\n",
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

let verificationCounts = null;
if (verificationResultsPath) {
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(join(repo, verificationResultsPath), "utf8"));
  } catch (error) {
    process.stderr.write(`review-merge: cannot read verification results: ${error.message}\n`);
    process.exit(1);
  }
  if (ledger.base_sha !== manifest.base_sha) {
    process.stderr.write(
      `review-merge: verification base_sha ${JSON.stringify(ledger.base_sha)} does not match manifest ${manifest.base_sha}\n`,
    );
    process.exit(1);
  }
  if (!Array.isArray(ledger.results)) {
    process.stderr.write("review-merge: verification results must be an array\n");
    process.exit(1);
  }

  const serious = found.filter((f) => f.sev === "critical" || f.sev === "high");
  const expected = new Map(serious.map((f) => [f.id, f]));
  const results = new Map();
  for (const result of ledger.results) {
    if (!result || typeof result !== "object" || typeof result.id !== "string") {
      process.stderr.write("review-merge: every verification result needs an id\n");
      process.exit(1);
    }
    if (results.has(result.id)) {
      process.stderr.write(`review-merge: duplicate verification result for ${result.id}\n`);
      process.exit(1);
    }
    if (!expected.has(result.id)) {
      process.stderr.write(`review-merge: unexpected verification result for ${result.id}\n`);
      process.exit(1);
    }
    if (!VERDICTS.includes(result.verdict)) {
      process.stderr.write(`review-merge: invalid verdict for ${result.id}\n`);
      process.exit(1);
    }
    if (typeof result.evidence !== "string" || !result.evidence.trim()) {
      process.stderr.write(`review-merge: ${result.id} needs non-empty verification evidence\n`);
      process.exit(1);
    }
    results.set(result.id, result);
  }
  for (const id of expected.keys()) {
    if (!results.has(id)) {
      process.stderr.write(`review-merge: missing verdict for ${id}\n`);
      process.exit(1);
    }
  }

  verificationCounts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0]));
  for (const finding of serious) {
    const result = results.get(finding.id);
    if (result.verdict === "confirmed-lower") {
      if (!Object.hasOwn(RANK, result.severity) || RANK[result.severity] <= RANK[finding.sev]) {
        process.stderr.write(
          `review-merge: ${finding.id} confirmed-lower needs a severity below ${finding.sev}\n`,
        );
        process.exit(1);
      }
      finding.sev = result.severity;
      finding.block = finding.block.replace(
        /^\*\*Severity:\*\*\s*[^\n]+/im,
        `**Severity:** ${result.severity}`,
      );
    } else if (result.severity !== undefined) {
      process.stderr.write(
        `review-merge: ${finding.id} may set severity only for confirmed-lower\n`,
      );
      process.exit(1);
    }
    finding.refuted = result.verdict === "refuted";
    const evidence = result.evidence.replace(/\s+/g, " ").trim();
    finding.block =
      `${finding.block.replace(/\n*$/, "")}\n\n` +
      `**Verification:** ${result.verdict}\n` +
      `**Verification evidence:** ${evidence}`;
    verificationCounts[result.verdict] += 1;
  }
}

const active = found.filter((f) => !f.refuted);
const refuted = found.filter((f) => f.refuted);
const count = (s) => active.filter((f) => f.sev === s).length;
const counts = { critical: count("critical"), high: count("high"), medium: count("medium"), low: count("low") };
const opened = manifest.shards.reduce((n, s) => n + s.files.length, 0);
const verified = Boolean(verificationResultsPath);

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
  `  total: ${active.length}`,
  `verified: ${verified}`,
  ...(verificationCounts
    ? [
        "verification:",
        ...VERDICTS.map((verdict) => `  ${verdict.replace("-", "_")}: ${verificationCounts[verdict]}`),
      ]
    : []),
  `status: ${active.length ? "issues_found" : "clean"}`,
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
  const rows = active.filter((f) => f.sev === sev);
  if (!rows.length) continue;
  lines.push(`## ${sev[0].toUpperCase()}${sev.slice(1)}`, "");
  for (const f of rows) {
    lines.push(f.block.replace(/^###\s+.+$/m, `### ${f.id}: ${f.title}`), "");
  }
}

if (refuted.length) {
  lines.push("## Refuted by verification", "");
  for (const finding of refuted) {
    lines.push(finding.block.replace(/^###\s+.+$/m, `### ${finding.id}: ${finding.title}`), "");
  }
}

if (sound.length) {
  lines.push("## Checked and found sound", "", ...sound.flatMap((s) => [s, ""]));
}

writeFileSync(join(repo, out), lines.join("\n"));
process.stdout.write(
  `${out}: ${active.length} finding(s) — ${counts.critical}C/${counts.high}H/${counts.medium}M/${counts.low}L, ` +
    `${opened}/${manifest.denominator} files opened.\n`,
);
