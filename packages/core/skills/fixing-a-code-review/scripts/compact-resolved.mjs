#!/usr/bin/env node
// Move fixed/stale findings from inline to a "Resolved findings" section at
// the bottom. Leaves skipped, deferred, and open findings in place.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const COMPACTABLE = ["fixed", "stale"];

// A finding's own body can legitimately quote a "## Resolved findings" or
// "### CR-###:" line inside a fenced code block — e.g. a finding *about*
// this very script illustrating the bug it describes with an example of the
// broken output (this happened for real: CR-004 in this report's own
// history). Naive line-anchored heading regexes can't tell that apart from
// real document structure, so a fenced example fools them into truncating
// the scan (or splitting a finding) right there, silently leaving every
// finding after it uncompacted.
//
// Returns a copy of `text` with identical length and line offsets, but with
// the leading "#" run blanked out on any heading-shaped line that falls
// inside a ``` or ~~~ fence. Matching against this masked copy — while still
// slicing the *original* text for output — makes every regex below blind to
// fenced headings without disturbing any real content or offset.
function maskFencedHeadings(text) {
  const lines = text.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    const heading = line.match(/^(\s*)(#{1,6})(\s.*)?$/);
    if (heading) {
      lines[i] = heading[1] + " ".repeat(heading[2].length) + (heading[3] ?? "");
    }
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

const die = (msg) => {
  process.stderr.write(`compact-resolved: ${msg}\n`);
  process.exit(2);
};

if (!existsSync(file)) die(`${file} not found`);

const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const fmEnd = raw.indexOf("\n---\n", 4);
if (!raw.startsWith("---\n") || fmEnd === -1) die(`${file} has no frontmatter`);
const front = raw.slice(0, fmEnd + 5);
const fullBody = raw.slice(fmEnd + 5);

// A prior run may have already written a "## Resolved findings" section.
// Only scan for compactable findings *above* it — findings already moved
// there must never be rescanned, or a second run collapses their
// preserved full blocks back down to one-line summaries and, since the
// heading itself lives after the scan point, duplicates the heading too.
// Matched against the fence-masked copy so a finding's own fenced example
// of this exact heading can't be mistaken for the real one.
const resolvedHeadingRe = /^## Resolved findings$/m;
const maskedFullBody = maskFencedHeadings(fullBody);
const headingMatch = resolvedHeadingRe.exec(maskedFullBody);
const hasResolvedSection = headingMatch !== null;
let body = hasResolvedSection ? fullBody.slice(0, headingMatch.index) : fullBody;
const existingResolvedTail = hasResolvedSection ? fullBody.slice(headingMatch.index) : "";

// Re-masked on the (possibly truncated) body: fence state only depends on
// ``` / ~~~ markers, and any fence must already be closed by the split point
// above (that point is itself outside every fence), so masking the prefix
// independently reproduces the same result.
let maskedBody = maskFencedHeadings(body);

const findingRe = /^###\s+(CR-\d{3}):\s+(.*)$/gm;
const resolved = [];
const summaries = [];
let match;

while ((match = findingRe.exec(maskedBody)) !== null) {
  const id = match[1];
  const title = match[2];
  const start = match.index;
  const rest = body.slice(start + match[0].length);
  const maskedRest = maskedBody.slice(start + match[0].length);
  const nextRel = maskedRest.search(/^#{2,3}\s+/m);
  const end = nextRel === -1 ? body.length : start + match[0].length + nextRel;
  const block = body.slice(start, end);

  const dispMatch = block.match(/^\*\*Disposition:\*\*\s*(\w+)/m);
  if (!dispMatch || !COMPACTABLE.includes(dispMatch[1])) continue;

  const commitMatch = block.match(/^\*\*Commit:\*\*\s*(?:`([^`]+)`|—)/m);
  const commit = commitMatch?.[1] || "—";
  const disposition = dispMatch[1];

  resolved.push({ id, title, disposition, commit, block: block.trimEnd(), start, end });
  summaries.push({ id, title, disposition, commit });
}

if (resolved.length === 0) {
  process.stdout.write("Nothing to compact — no fixed or stale findings.\n");
  process.exit(0);
}

for (let i = resolved.length - 1; i >= 0; i--) {
  const r = resolved[i];
  const summary = `- **${r.id}:** ${r.title} — ${r.disposition}${r.commit !== "—" ? ` (\`${r.commit}\`)` : ""}\n`;
  body = body.slice(0, r.start) + summary + body.slice(r.end);
}

const newBlocks = resolved.map((r) => r.block).join("\n") + "\n";

let resolvedTail;
if (hasResolvedSection) {
  // Extend the existing section instead of creating a second heading.
  resolvedTail = existingResolvedTail.replace(/\n*$/, "\n") + newBlocks;
} else {
  resolvedTail = "\n## Resolved findings\n\n" + newBlocks;
}

if (hasResolvedSection) {
  body = body + resolvedTail;
} else {
  const checkedIdx = body.indexOf("\n## Checked and found sound");
  if (checkedIdx !== -1) {
    const afterChecked = body.indexOf("\n## ", checkedIdx + 1);
    const insertAt = afterChecked === -1 ? body.length : afterChecked;
    body = body.slice(0, insertAt) + "\n" + resolvedTail + body.slice(insertAt);
  } else {
    body = body.trimEnd() + "\n" + resolvedTail;
  }
}

writeFileSync(file, front + body.replace(/\n*$/, "\n"));
process.stdout.write(
  `Compacted ${resolved.length} finding(s): ${summaries.map((s) => s.id).join(", ")}\n`,
);
