// Validate shard reports against the manifest as they land, before the merge.
//
// The merge refuses a malformed report, but only once every shard is in, and
// one bad record then fails the whole run. This applies the same grammar the
// moment a report exists, plus the lint the merge cannot see (a `###` inside a
// fence, a line-number citation in the body), so a reviewer's mistake is
// caught while that reviewer is still around to fix it.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FRONTMATTER_RE,
  RANK,
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

export function main() {
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const shardsDir = arg("shards", ".moe/review-shards");
const only = arg("shard", "");
const requireAll = process.argv.includes("--require-all");
const manifest = JSON.parse(readFileSync(join(repo, shardsDir, "manifest.json"), "utf8"));
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

const out = (line) => process.stdout.write(`${line}\n`);
let exitCode = 0;
if (head !== manifest.base_sha) {
  out(`PROBLEM HEAD ${head} does not match manifest base_sha ${manifest.base_sha}; the merge will refuse this tree`);
  exitCode = 1;
}

const total = { critical: 0, high: 0, medium: 0, low: 0 };
const missing = [];
let present = 0;
let problemReports = 0;

for (const shard of manifest.shards) {
  if (only && String(shard.id) !== String(only)) continue;
  const label = `shard-${String(shard.id).padStart(3, "0")}`;
  const reportPath = join(repo, shard.report_path);
  if (!existsSync(reportPath)) {
    missing.push(label);
    continue;
  }
  present += 1;
  const raw = readFileSync(reportPath, "utf8").replace(/\r\n/g, "\n");
  const problems = [];
  const provenance = parseProvenance(raw);
  if (!provenance) {
    problems.push("missing shard provenance header");
  } else {
    if (provenance.base_sha !== manifest.base_sha) {
      problems.push(`base_sha ${provenance.base_sha} does not match manifest ${manifest.base_sha}`);
    }
    if (provenance.files_opened !== shard.files.length) {
      problems.push(
        `files_opened ${provenance.files_opened} does not match the ${shard.files.length} assigned`,
      );
    }
  }
  const body = (provenance ? raw.slice(provenance.length) : raw).replace(FRONTMATTER_RE, "");

  // A heading inside a fence still splits the finding at merge time.
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (inFence && /^###\s/.test(line)) {
      problems.push(`'###' line inside a fenced block splits a finding: ${line.slice(0, 60)}`);
    }
  }

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const section of splitSections(body)) {
    if (section.sound) continue;
    const sectionProblems = findingProblems(section.block, repo);
    if (/^(?:CR-\d+|\d+)[.:]\s/.test(section.title)) {
      sectionProblems.push("numbered heading; the merge owns IDs");
    }
    const cite = section.block.match(/`[^`\n]*\.[A-Za-z0-9]+:\d+(?:-\d+)?`/);
    if (cite) sectionProblems.push(`line-number citation: ${cite[0]}`);
    if (sectionProblems.length) {
      problems.push(...sectionProblems.map((problem) => `${section.title}: ${problem}`));
    } else {
      counts[findingFields(section.block).sev] += 1;
    }
  }
  for (const severity of Object.keys(RANK)) total[severity] += counts[severity];

  if (problems.length) {
    problemReports += 1;
    exitCode = 1;
  }
  out(
    `${problems.length ? "PROBLEM" : "ok"} ${label} ` +
      `${counts.critical}C/${counts.high}H/${counts.medium}M/${counts.low}L`,
  );
  for (const problem of problems) out(`    - ${problem}`);
}

if (missing.length) {
  if (requireAll) {
    exitCode = 1;
    out(`PROBLEM missing ${missing.length} report(s): ${missing.join(", ")}`);
  } else {
    out(`${missing.length} shard(s) not yet reported`);
  }
}
out(
  `\n${present}/${manifest.shards.length} reports; running total ` +
    `${total.critical}C/${total.high}H/${total.medium}M/${total.low}L; ` +
    `${problemReports} report(s) with problems`,
);
process.exit(exitCode);
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(modulePath)) main();
