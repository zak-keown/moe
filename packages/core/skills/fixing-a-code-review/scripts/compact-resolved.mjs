// Move fixed/stale findings from inline to a "Resolved findings" section at
// the bottom. Leaves skipped, deferred, and open findings in place.
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const COMPACTABLE = ["fixed", "stale"];

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

export function main() {
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
let body = raw.slice(fmEnd + 5);

const findingRe = /^###\s+(CR-\d{3}):\s+(.*)$/gm;
const resolved = [];
const summaries = [];
let match;

while ((match = findingRe.exec(body)) !== null) {
  const id = match[1];
  const title = match[2];
  const start = match.index;
  const rest = body.slice(start + match[0].length);
  const nextRel = rest.search(/^#{2,3}\s+/m);
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

const resolvedSection =
  "\n## Resolved findings\n\n" +
  resolved.map((r) => r.block).join("\n") +
  "\n";

const checkedIdx = body.indexOf("\n## Checked and found sound");
if (checkedIdx !== -1) {
  const afterChecked = body.indexOf("\n## ", checkedIdx + 1);
  const insertAt = afterChecked === -1 ? body.length : afterChecked;
  body = body.slice(0, insertAt) + "\n" + resolvedSection + body.slice(insertAt);
} else {
  body = body.trimEnd() + "\n" + resolvedSection;
}

writeFileSync(file, front + body.replace(/\n*$/, "\n"));
process.stdout.write(
  `Compacted ${resolved.length} finding(s): ${summaries.map((s) => s.id).join(", ")}\n`,
);
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(modulePath)) main();
