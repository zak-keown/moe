// Record challenger verdicts into the ledger review-merge consumes.
//
// Hand-writing dozens of JSON entries is where a typo silently changes a
// verdict. Every entry is checked against the verify manifest before anything
// is written, and the ledger is rewritten whole so a crash cannot leave a
// partial file. Input is either a bare JSON object or a whole agent reply,
// from which the last `VERDICT-JSON:` line is taken.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RANK, VERDICTS } from "./review-report.mjs";

const EVIDENCE_CAP = 1000;
const fail = (message) => {
  process.stderr.write(`review-verify-record: ${message}\n`);
  process.exit(2);
};

const argv = process.argv.slice(2);
let shardsDir = ".moe/review-shards";
let replace = false;
const inputs = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--shards") shardsDir = argv[++i];
  else if (a.startsWith("--shards=")) shardsDir = a.slice("--shards=".length);
  else if (a === "--replace") replace = true;
  else if (a === "--from-file") inputs.push(readFileSync(argv[++i], "utf8"));
  else if (a === "--stdin") inputs.push(readFileSync(0, "utf8"));
  else if (a.startsWith("--")) fail(`unknown option ${a}`);
  else inputs.push(a);
}
if (!inputs.length) fail("nothing to record: pass a JSON verdict, --from-file <reply>, or --stdin");

const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const manifestPath = join(repo, shardsDir, "verify", "manifest.json");
if (!existsSync(manifestPath)) fail(`${shardsDir}/verify/manifest.json not found; run review-verify-scope first`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const originalSeverity = new Map(manifest.findings.map((f) => [f.id, f.severity]));

const extract = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const lines = [...trimmed.matchAll(/^\s*VERDICT-JSON:\s*(\{.*\})\s*$/gm)];
  if (!lines.length) fail("no VERDICT-JSON line found in the reply");
  return JSON.parse(lines[lines.length - 1][1]);
};

const validate = (raw) => {
  const { id, verdict, severity, evidence } = raw;
  if (typeof id !== "string" || !originalSeverity.has(id)) {
    fail(`${id ?? "(no id)"} is not a serious finding in the verify manifest`);
  }
  const original = originalSeverity.get(id);
  if (!VERDICTS.includes(verdict)) fail(`${id}: verdict must be one of ${VERDICTS.join("|")}, got ${verdict}`);
  if (typeof evidence !== "string" || !evidence.trim()) fail(`${id}: evidence is required`);
  if (evidence.trim().length > EVIDENCE_CAP) {
    fail(`${id}: evidence is ${evidence.trim().length} characters; keep it under ${EVIDENCE_CAP}`);
  }
  const entry = { id, verdict, evidence: evidence.trim() };
  if (verdict === "confirmed-lower") {
    if (!Object.hasOwn(RANK, severity) || RANK[severity] <= RANK[original]) {
      fail(`${id}: confirmed-lower needs a severity below ${original}, got ${severity ?? "nothing"}`);
    }
    entry.severity = severity;
  } else if (severity !== undefined && severity !== original) {
    fail(`${id}: severity ${severity} contradicts a ${verdict} verdict; use confirmed-lower to change severity`);
  }
  return entry;
};

const entries = inputs.map((text) => validate(extract(text)));

const ledgerPath = join(repo, shardsDir, "verifications.json");
const ledger = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, "utf8"))
  : { base_sha: manifest.base_sha, results: [] };
if (ledger.base_sha !== manifest.base_sha) {
  fail(`ledger base_sha ${ledger.base_sha} does not match verify manifest ${manifest.base_sha}`);
}
for (const entry of entries) {
  const existing = ledger.results.find((r) => r.id === entry.id);
  if (existing && !replace) {
    fail(`${entry.id} already has a verdict (${existing.verdict}); pass --replace to overwrite it`);
  }
}
for (const entry of entries) {
  const i = ledger.results.findIndex((r) => r.id === entry.id);
  if (i >= 0) ledger.results[i] = entry;
  else ledger.results.push(entry);
  process.stdout.write(`recorded ${entry.id} ${entry.verdict}${entry.severity ? ` -> ${entry.severity}` : ""}\n`);
}
ledger.results.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

const recorded = new Set(ledger.results.map((r) => r.id));
const missing = manifest.findings.filter((f) => !recorded.has(f.id)).length;
const tally = Object.fromEntries(
  VERDICTS.map((v) => [v, ledger.results.filter((r) => r.verdict === v).length]),
);
process.stdout.write(
  `ledger: ${ledger.results.length}/${manifest.findings.length} recorded; ${missing} missing; tally ${JSON.stringify(tally)}\n`,
);
