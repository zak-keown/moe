#!/usr/bin/env node
// Enumerate, exclude, group and shard a repository for review.
//
// Deterministic on purpose. Three baseline runs asked to count "source files"
// in one tree returned 874, 935 and 943, so the denominator a review reports is
// only meaningful if one program computes it the same way every time.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const CODE = ["ts", "tsx", "js", "mjs", "cjs", "py", "rs", "go", "rb", "java", "cs"];
const DEPTH_EXTS = {
  shallow: CODE,
  medium: CODE,
  deep: [...CODE, "sh", "bash", "yaml", "yml", "toml", "json"],
};

// Always in scope, at every depth, regardless of extension. Found by a GREEN
// run: the highest-severity finding in that review was a committed credential
// in `secrets.env`, a file the extension filter excluded entirely — so the tool
// reported `files_opened: 13` while the critical finding came from outside its
// own denominator. Secrets do not live in files with code extensions, which is
// exactly why the filter missed them.
const ALWAYS = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)(secrets?|credentials?)(\.|$)/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/,
  /(^|\/)\.(npmrc|pypirc|netrc|dockercfg)$/,
  /(^|\/)\.git-credentials$/,
];

// Excluded at every depth. Generated output and vendored trees are not review
// surface, and a lockfile finding is never actionable.
const EXCLUDE = [
  /(^|\/)node_modules\//,
  /(^|\/)(dist|build|out|target|coverage)\//,
  /(^|\/)vendor\//,
  /\.min\.(js|css)$/,
  /\.(bundle|generated)\./,
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock|Gemfile\.lock)$/,
];

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const depth = arg("depth", "medium");
if (!Object.hasOwn(DEPTH_EXTS, depth)) {
  process.stderr.write(`review-scope: unknown depth "${depth}" (shallow|medium|deep)\n`);
  process.exit(2);
}
const outDir = arg("out", ".review-shards");
const shardSize = Number(arg("shard-size", "30"));
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

const tracked = execFileSync("git", ["ls-files"], { cwd: repo, encoding: "utf8", maxBuffer: 64e6 })
  .split("\n")
  .filter(Boolean);

const exts = DEPTH_EXTS[depth];
const re = new RegExp(`\\.(${exts.join("|")})$`);
const files = tracked
  .filter((f) => re.test(f) || ALWAYS.some((x) => x.test(f)))
  .filter((f) => !EXCLUDE.some((x) => x.test(f)))
  // git ls-files lists deleted-but-staged paths mid-rebase.
  .filter((f) => existsSync(join(repo, f)) && statSync(join(repo, f)).isFile())
  .sort();

if (files.length === 0) {
  process.stderr.write("review-scope: nothing in scope after filtering.\n");
  process.exit(1);
}

// shallow narrows to entrypoints plus the files git says change most.
let selected = files;
if (depth === "shallow") {
  const log = execFileSync("git", ["log", "--format=", "--name-only", "-n", "400"], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 64e6,
  })
    .split("\n")
    .filter(Boolean);
  const heat = new Map();
  for (const f of log) heat.set(f, (heat.get(f) ?? 0) + 1);
  const entry = /(^|\/)(index|main|cli|app|server|bin)\.[^/]+$/;
  selected = files
    .filter((f) => entry.test(f) || (heat.get(f) ?? 0) > 1)
    .sort((a, b) => (heat.get(b) ?? 0) - (heat.get(a) ?? 0) || a.localeCompare(b));
  if (selected.length === 0) selected = files.slice(0, shardSize);
}

const groups = new Map();
for (const f of selected) {
  const i = f.indexOf("/");
  const g = i === -1 ? "root" : f.slice(0, i);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(f);
}

mkdirSync(join(repo, outDir), { recursive: true });
const shards = [];
for (const [group, list] of [...groups.entries()].sort()) {
  for (let i = 0; i < list.length; i += shardSize) {
    const id = shards.length + 1;
    const part = list.length > shardSize ? `-part${Math.floor(i / shardSize) + 1}` : "";
    const stem = `shard-${String(id).padStart(3, "0")}-${group}${part}`;
    const chunk = list.slice(i, i + shardSize);
    writeFileSync(join(repo, outDir, `${stem}-files.txt`), chunk.join("\n") + "\n");
    shards.push({
      id,
      group,
      files: chunk,
      files_path: `${outDir}/${stem}-files.txt`,
      report_path: `${outDir}/${stem}-REVIEW.md`,
    });
  }
}

// Tracked files the denominator does not cover. Coverage has to name these:
// "not opened" is otherwise always zero here, because every file in the
// denominator gets sharded — which would let a report imply total coverage of a
// tree it only partly counted.
const outside = tracked.filter((f) => !selected.includes(f));
const outsideGroups = [...new Set(outside.map((f) => (f.includes("/") ? f.slice(0, f.indexOf("/")) : "root")))].sort();

const manifest = {
  base_sha: sha,
  depth,
  shard_size: shardSize,
  // The denominator the report must quote, computed once so it cannot drift.
  denominator: selected.length,
  denominator_rule:
    `tracked files with extension ${exts.map((e) => `.${e}`).join(", ")} plus every ` +
    `credential-bearing path (.env, keys, .npmrc and similar) at any extension, ` +
    `excluding generated output, vendored trees and lockfiles` +
    (depth === "shallow" ? ", narrowed to entrypoints and files changed more than once in the last 400 commits" : ""),
  in_scope_total: files.length,
  outside_denominator: outside.length,
  outside_denominator_areas: outsideGroups,
  not_selected: files.length - selected.length,
  shards,
};
writeFileSync(join(repo, outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(
  `${shards.length} shard(s) across ${groups.size} group(s); ` +
    `denominator ${selected.length} at depth ${depth}, base ${sha}.\n`,
);
