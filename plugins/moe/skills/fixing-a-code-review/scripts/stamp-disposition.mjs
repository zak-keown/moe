// Stamp one finding's disposition into CODEBASE-REVIEW.md and refresh the
// frontmatter counts.
//
// Exists because three disciplined baseline agents wrote this record three
// different ways and none of them updated the frontmatter. Hand-stamping is the
// step that gets skipped under time pressure, and a report whose frontmatter
// disagrees with its findings cannot be resumed from.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DISPOSITIONS = ["fixed", "stale", "skipped", "deferred"];

// A finding's own body can legitimately contain a fenced illustration of a
// stamp block or a heading — e.g. a finding *about* this exact script
// showing a realistic example of the bug it describes. Matching structural
// patterns (heading search, disposition-duplicate check) against fenced
// content mistakes that illustration for the real thing: the block-boundary
// search can stop at a fenced heading and splice the stamp into the middle
// of the example instead of appending it after the finding's real content,
// and a fenced "**Disposition:**" example can trip the duplicate-stamp
// refusal. Returns a copy of `text` with every character on a fenced
// interior line replaced by a space — identical length and line count, so
// indices found via regex on the masked copy stay valid against the
// original — leaving fence markers and non-fenced lines untouched.
function maskFencedLines(text) {
  const lines = text.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) lines[i] = " ".repeat(line.length);
  }
  return lines.join("\n");
}

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

// Locate the finding's block: its heading up to the next heading of any
// level. Matched against the fence-masked copy so a fenced illustration of
// a heading can't be mistaken for the real next finding.
const maskedBody = maskFencedLines(body);
const head = new RegExp(`^###\\s+${id}:.*$`, "m").exec(maskedBody);
if (!head) die(`${id} not found in ${file}`);
const start = head.index;
const maskedRest = maskedBody.slice(start + head[0].length);
const nextRel = maskedRest.search(/^#{2,3}\s+/m);
const end = nextRel === -1 ? body.length : start + head[0].length + nextRel;

let block = body.slice(start, end).replace(/\n*$/, "");
// Checked against the masked block too, so a fenced "**Disposition:**"
// example doesn't trip a false "already stamped" refusal.
if (/^\*\*Disposition:\*\*/m.test(maskedBody.slice(start, end))) {
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

// Refresh the counts from what is actually stamped, never from a running
// total. Tallied against a freshly fence-masked copy of the updated body so
// a fenced illustration of a stamp (e.g. this exact finding's own example)
// isn't counted as a real disposition.
const tally = Object.fromEntries(DISPOSITIONS.map((d) => [d, 0]));
for (const m of maskFencedLines(body).matchAll(/^\*\*Disposition:\*\*\s*(\w+)/gm)) {
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
