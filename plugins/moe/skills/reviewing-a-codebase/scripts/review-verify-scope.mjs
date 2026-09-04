// Split the merged report's critical and high findings into one file each.
//
// A verify-finding challenger reads exactly its finding, and the ledger
// writer learns the complete ID set it must account for, from the same
// manifest — so neither can drift from what the merge assigned.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RANK, findingFields, splitSections } from "./review-report.mjs";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const fail = (message) => {
  process.stderr.write(`review-verify-scope: ${message}\n`);
  process.exit(1);
};

const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const shardsDir = arg("shards", ".moe/review-shards");
const reportPath = arg("report", "CODEBASE-REVIEW.md");
const manifest = JSON.parse(readFileSync(join(repo, shardsDir, "manifest.json"), "utf8"));
if (!existsSync(join(repo, reportPath))) fail(`report not found: ${reportPath}`);
const report = readFileSync(join(repo, reportPath), "utf8").replace(/\r\n/g, "\n");

const frontmatter = report.match(/^---\n([\s\S]*?)\n---\n/);
const baseSha = frontmatter?.[1].match(/^base_sha:\s*(\S+)$/m)?.[1];
if (baseSha !== manifest.base_sha) {
  fail(`report base_sha ${baseSha ?? "(none)"} does not match shard manifest ${manifest.base_sha}`);
}
const body = report.slice(frontmatter[0].length);

const findings = [];
for (const section of splitSections(body)) {
  const id = section.title.match(/^(CR-\d{3}): (.+)$/);
  if (!id) continue;
  // A `###` block runs to the next `###`; cut it at the next `##` so the last
  // finding in a severity section does not swallow the heading that follows.
  const block = section.block.split(/\n## /)[0].trim();
  const { sev, file } = findingFields(block);
  if (sev !== "critical" && sev !== "high") continue;
  // Already-challenged findings carry a verdict; re-scoping must not re-issue them.
  if (/^\*\*Verification:\*\*/m.test(block)) continue;
  findings.push({ id: id[1], severity: sev, file, title: id[2], block });
}
findings.sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.id.localeCompare(b.id));

const outDir = join(repo, shardsDir, "verify");
if (existsSync(outDir)) {
  if (lstatSync(outDir).isSymbolicLink()) fail(`refusing to write through a symlink: ${outDir}`);
  for (const name of readdirSync(outDir)) {
    if (/^CR-\d{3}\.md$/.test(name)) rmSync(join(outDir, name));
  }
} else {
  mkdirSync(outDir);
}
for (const finding of findings) {
  finding.path = `${shardsDir}/verify/${finding.id}.md`;
  writeFileSync(join(repo, finding.path), `${finding.block}\n`);
}
writeFileSync(
  join(outDir, "manifest.json"),
  `${JSON.stringify(
    {
      base_sha: manifest.base_sha,
      report: reportPath,
      generated: new Date().toISOString().slice(0, 10),
      findings: findings.map(({ block, ...rest }) => rest),
    },
    null,
    2,
  )}\n`,
);
const critical = findings.filter((f) => f.severity === "critical").length;
process.stdout.write(
  `${findings.length} serious finding(s) written to ${shardsDir}/verify ` +
    `(${critical}C/${findings.length - critical}H); dispatch one verify-finding agent per file.\n`,
);
