// The one grammar for shard reports.
//
// review-merge.mjs, review-check.mjs and review-verify-scope.mjs all split a
// report into `###` sections and read the three finding fields. Three copies
// of that regex would drift, and a checker that passes what the merge then
// refuses is worse than no checker. So the grammar lives here once.
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const RANK = { critical: 0, high: 1, medium: 2, low: 3 };
export const VERDICTS = ["confirmed", "confirmed-lower", "refuted", "unproven"];
export const PROVENANCE_RE =
  /^<!-- moe-review-shard\nbase_sha: ([0-9a-f]{40})\nfiles_opened: (\d+)\n-->\n?/;
export const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;

export function parseProvenance(raw) {
  const match = raw.match(PROVENANCE_RE);
  if (!match) return null;
  return { base_sha: match[1], files_opened: Number(match[2]), length: match[0].length };
}

// Every `###` heading starts a section; the block runs to the next heading.
export function splitSections(body) {
  const heads = [...body.matchAll(/^###\s+(.+)$/gm)];
  return heads.map((head, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : body.length;
    return {
      title: head[1],
      block: body.slice(head.index, end).trim(),
      sound: /^checked and found sound/i.test(head[1]),
    };
  });
}

export function findingFields(block) {
  const severity = (block.match(/^\*\*Severity:\*\*\s*([^\n]+)/im) || [])[1]?.trim();
  const file = (block.match(/^\*\*File:\*\*\s*`?([^`\n]+)`?/im) || [])[1]?.trim();
  const anchor = (block.match(/^\*\*Anchor:\*\*\s*`?([^`\n]+)`?/im) || [])[1]?.trim();
  return { severity, sev: severity?.toLowerCase(), file, anchor };
}

// Why a finding block cannot be merged, or [] when it can. A finding the fix
// workflow cannot address (no path, a phantom path, a line number that will
// drift) is refused rather than silently dropped.
export function findingProblems(block, repo) {
  const { sev, file, anchor } = findingFields(block);
  const problems = [];
  if (!file) {
    problems.push("missing **File:** field");
  } else if (/:\d+$/.test(file)) {
    problems.push(`File carries a line number: ${file}`);
  } else if (isAbsolute(file) || file.split("/").includes("..")) {
    problems.push(`File must be a repository-relative path: ${file}`);
  } else if (!existsSync(join(repo, file))) {
    problems.push(`File does not exist in the tree: ${file}`);
  }
  if (!anchor) {
    problems.push("anchor field missing or unparseable (**Anchor:** needs a single-backtick span)");
  }
  if (!Object.hasOwn(RANK, sev)) {
    problems.push(`severity must be critical|high|medium|low, got ${sev ?? "nothing"}`);
  }
  return problems;
}
