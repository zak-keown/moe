#!/usr/bin/env node
// Stamp one finding's disposition into CODEBASE-REVIEW.md and refresh the
// frontmatter counts.
//
// Exists because three disciplined baseline agents wrote this record three
// different ways and none of them updated the frontmatter. Hand-stamping is the
// step that gets skipped under time pressure, and a report whose frontmatter
// disagrees with its findings cannot be resumed from.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DISPOSITIONS = ["fixed", "stale", "skipped", "deferred"];

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const file = arg("file", "CODEBASE-REVIEW.md");
const id = arg("id");
const disposition = arg("disposition");
const commit = arg("commit", "");
const note = arg("note", "");

const die = (msg) => {
  process.stderr.write(`stamp-disposition: ${msg}\n`);
  process.exit(2);
};

if (!id || !/^CR-\d{3}$/.test(id)) die("--id must be a finding id like CR-004");
if (!DISPOSITIONS.includes(disposition)) die(`--disposition must be one of ${DISPOSITIONS.join(", ")}`);
if (disposition === "fixed" && !commit) die("a `fixed` disposition needs --commit");
if (disposition !== "fixed" && !note) die(`a \`${disposition}\` disposition needs --note explaining why`);
if (!existsSync(file)) die(`${file} not found — run the review first`);

const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const fmEnd = raw.indexOf("\n---\n", 4);
if (!raw.startsWith("---\n") || fmEnd === -1) die(`${file} has no frontmatter to update`);
let front = raw.slice(4, fmEnd);
let body = raw.slice(fmEnd + 5);

// Locate the finding's block: its heading up to the next heading of any level.
const head = new RegExp(`^###\\s+${id}:.*$`, "m").exec(body);
if (!head) die(`${id} not found in ${file}`);
const start = head.index;
const rest = body.slice(start + head[0].length);
const nextRel = rest.search(/^#{2,3}\s+/m);
const end = nextRel === -1 ? body.length : start + head[0].length + nextRel;

let block = body.slice(start, end).replace(/\n*$/, "");
if (/^\*\*Disposition:\*\*/m.test(block)) {
  die(`${id} already has a disposition — refusing to stamp it twice`);
}

const stamp = [
  "",
  "",
  `**Disposition:** ${disposition}`,
  `**Commit:** ${commit ? `\`${commit}\`` : "—"}`,
  `**Resolved:** ${new Date().toISOString().slice(0, 10)}`,
  `**Note:** ${note || "—"}`,
  "",
].join("\n");

body = body.slice(0, start) + block + stamp + body.slice(end);

// Refresh the counts from what is actually stamped, never from a running total.
const tally = Object.fromEntries(DISPOSITIONS.map((d) => [d, 0]));
for (const m of body.matchAll(/^\*\*Disposition:\*\*\s*(\w+)/gm)) {
  if (Object.hasOwn(tally, m[1])) tally[m[1]] += 1;
}
const total = (front.match(/^\s+total:\s*(\d+)/m) || [])[1];
const open = total ? Number(total) - Object.values(tally).reduce((a, b) => a + b, 0) : null;

const blockYaml =
  "dispositions:\n" +
  DISPOSITIONS.map((d) => `  ${d}: ${tally[d]}`).join("\n") +
  (open === null ? "" : `\n  open: ${open}`);

front = /^dispositions:/m.test(front)
  ? front.replace(/^dispositions:\n(?:\s{2}\w+:\s*\d+\n?)*/m, blockYaml + "\n")
  : `${front.replace(/\n*$/, "")}\n${blockYaml}`;

writeFileSync(file, `---\n${front.replace(/\n*$/, "")}\n---\n${body.replace(/\n*$/, "")}\n`);
process.stdout.write(
  `${id} → ${disposition}${commit ? ` (${commit})` : ""}; ` +
    DISPOSITIONS.map((d) => `${d} ${tally[d]}`).join(", ") +
    (open === null ? "" : `, open ${open}`) +
    "\n",
);
