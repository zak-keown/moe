#!/usr/bin/env node
/**
 * Generate `/plugins/` — every installable Moe plugin — with moe-mint.
 *
 * This is the step the whole monorepo exists for. ARCHITECTURE.md section 2: a
 * repository is not an installable plugin. Source lives in `packages/`, plugin
 * manifests are GENERATED into `/plugins/`, and plugin boundaries are a
 * build-time choice rather than a directory layout.
 *
 * ## Why staging
 *
 * moe-mint reads exactly `<root>/moe-mint.yaml` and uses ONE root for both
 * config-in and files-out. Pointed at a source package that would mean writing
 * generated manifests into `packages/<pkg>/`, and it made two things impossible:
 *
 *   1. **Two plugins from one source tree.** `moe-core` and `moe-everything` are
 *      the same 27 skills split by tier. One root cannot hold two `moe-mint.yaml`
 *      files or two outputs.
 *   2. **The opencode and pi adapters.** Both emit a FULL-REPLACEMENT
 *      `package.json` into the plugin root — which for core would have been
 *      `packages/core/package.json`, the pnpm workspace manifest. They were
 *      excluded in config with a comment saying "until the plugin root is a
 *      staging directory rather than the source tree".
 *
 * So this script stages. For each plugin it wipes `plugins/<name>/`, copies in
 * the config plus exactly the content that plugin ships, and runs
 * `moe-mint generate --dir plugins/<name>`. The plugin root IS the staging
 * directory, both problems dissolve, and moe-mint needed no changes at all.
 *
 * `plugins/*` is deliberately not a pnpm workspace glob (`pnpm-workspace.yaml`),
 * so a generated `package.json` under a staging root is inert.
 *
 * ## Determinism
 *
 * `pnpm mint:check` asserts `/plugins/` regenerates byte-identically, so a
 * hand-edited manifest cannot drift. That holds because:
 *
 *   - moe-mint's output has no timestamps. Its generation manifest is
 *     `{schema, tool, files: {path: {sha256, ...}}}` — content-addressed only.
 *   - each staging root is wiped first, so a file dropped from a plugin cannot
 *     survive as a stale leftover.
 *   - directory reads are sorted before copying, so the emitted order does not
 *     depend on the filesystem.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "plugins");
const MINT_CLI = path.join(ROOT, "packages/mint/dist/cli.js");

/**
 * Content a plugin can ship. These are moe-mint's default component paths
 * (`packages/mint/src/config.ts`), so a config that does not override
 * `components:` finds them exactly here.
 */
const COMPONENTS = ["skills", "commands", "agents", "hooks", ".mcp.json"];

/**
 * The plugin registry. `tier` is set only where one source tree emits more than
 * one plugin: it names the `skill-tiers.yaml` tiers whose skills to stage.
 *
 * `checkMarketplace()` below asserts this list agrees with
 * `.claude-plugin/marketplace.json`, in both directions: a plugin generated but
 * not listed is uninstallable, and one listed but not generated is a broken
 * link. Both fail silently otherwise, which is why it is checked here rather
 * than left to discovery.
 */
const PLUGINS = [
  { name: "moe-core", pkg: "core", config: "mint/moe-core.yaml", tiers: ["core"] },
  {
    name: "moe-everything",
    pkg: "core",
    config: "mint/moe-everything.yaml",
    tiers: ["core", "everything"],
  },
  { name: "moe-backstory", pkg: "backstory", config: "mint/moe-backstory.yaml" },
  { name: "moe-memory", pkg: "memory", config: "mint/moe-memory.yaml" },
  { name: "moe-glass", pkg: "glass", config: "mint/moe-glass.yaml" },
  { name: "moe-crew", pkg: "crew", config: "mint/moe-crew.yaml" },
];

/**
 * Skill directories that are not skills.
 *
 * `_shared/` holds fragments that skills include; it has no SKILL.md, is not in
 * `skill-tiers.yaml`, and is why `packages/core/skills/` has 28 entries for 27
 * skills. It is staged for EVERY tier — a lean-tier skill including a shared
 * fragment that was filtered out is a dead link mid-workflow, which is the same
 * failure the tier closure rule exists to prevent.
 */
const ALWAYS_STAGE = new Set(["_shared"]);

function fail(message) {
  console.error(`mint-plugins: ${message}`);
  process.exit(1);
}

/** Recursive copy with sorted directory reads, so output order is stable. */
function copyInto(from, to) {
  const stat = fs.statSync(from);
  if (!stat.isDirectory()) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    // Preserve the execute bit: hook scripts need it, and moe-mint's own
    // manifest records executability per file.
    if (stat.mode & 0o111) fs.chmodSync(to, stat.mode & 0o777);
    return;
  }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from).sort()) {
    copyInto(path.join(from, entry), path.join(to, entry));
  }
}

/** The skill names to stage for a plugin, or null to stage all of them. */
function skillsForTiers(pkgDir, tiers) {
  if (!tiers) return null;
  const tiersPath = path.join(pkgDir, "skill-tiers.yaml");
  if (!fs.existsSync(tiersPath)) {
    fail(
      `${path.relative(ROOT, tiersPath)} is missing, but a plugin asks for tiers ${tiers.join(", ")}`,
    );
  }
  const parsed = parseYaml(fs.readFileSync(tiersPath, "utf8"));
  const wanted = new Set(tiers);
  const names = new Set();
  for (const [name, entry] of Object.entries(parsed.skills ?? {})) {
    if (wanted.has(entry.tier)) names.add(name);
  }
  if (names.size === 0) fail(`no skills matched tiers ${tiers.join(", ")} in skill-tiers.yaml`);
  return names;
}

function stage(plugin) {
  const pkgDir = path.join(ROOT, "packages", plugin.pkg);
  const dest = path.join(OUT, plugin.name);
  const configSrc = path.join(pkgDir, plugin.config);
  if (!fs.existsSync(configSrc)) fail(`missing config ${path.relative(ROOT, configSrc)}`);

  // Wipe first. A staging root is generated output in its entirety, so an
  // incremental copy would let a file deleted from source survive here — and
  // survive into `plugins/`, which is committed.
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  // moe-mint requires the config at this exact name in the plugin root.
  fs.copyFileSync(configSrc, path.join(dest, "moe-mint.yaml"));

  const keep = skillsForTiers(pkgDir, plugin.tiers);
  let staged = 0;

  for (const component of COMPONENTS) {
    const src = path.join(pkgDir, component);
    if (!fs.existsSync(src)) continue;

    if (component === "skills" && keep) {
      fs.mkdirSync(path.join(dest, "skills"), { recursive: true });
      for (const entry of fs.readdirSync(src).sort()) {
        if (!keep.has(entry) && !ALWAYS_STAGE.has(entry)) continue;
        copyInto(path.join(src, entry), path.join(dest, "skills", entry));
        staged++;
      }
      continue;
    }
    copyInto(src, path.join(dest, component));
    if (component === "skills") staged += fs.readdirSync(src).length;
  }

  return { dest, staged };
}

function generate(plugin, dest) {
  try {
    const out = execFileSync(
      process.execPath,
      [MINT_CLI, "generate", "--dir", path.relative(ROOT, dest)],
      {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return out.trim();
  } catch (error) {
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    fail(`moe-mint generate failed for ${plugin.name}`);
  }
}

/**
 * A plugin generated but not listed in the marketplace is uninstallable; one
 * listed but not generated is a broken link. Both are silent, so both are
 * checked here rather than left to discovery.
 */
function checkMarketplace() {
  const file = path.join(ROOT, ".claude-plugin/marketplace.json");
  const listed = JSON.parse(fs.readFileSync(file, "utf8")).plugins ?? [];
  const listedNames = new Set(listed.map((p) => p.name));
  const built = new Set(PLUGINS.map((p) => p.name));

  const problems = [];
  for (const name of built) {
    if (!listedNames.has(name))
      problems.push(`${name} is generated but absent from marketplace.json`);
  }
  for (const entry of listed) {
    if (!built.has(entry.name))
      problems.push(`${entry.name} is in marketplace.json but nothing generates it`);
    const expected = `./plugins/${entry.name}`;
    if (built.has(entry.name) && entry.source !== expected) {
      problems.push(
        `${entry.name}: marketplace source is "${entry.source}", expected "${expected}"`,
      );
    }
  }
  if (problems.length > 0)
    fail(`marketplace.json disagrees with the plugin registry:\n  - ${problems.join("\n  - ")}`);
}

function main() {
  if (!fs.existsSync(MINT_CLI)) {
    fail(
      `${path.relative(ROOT, MINT_CLI)} not found — run \`pnpm --filter @bubstack/moe-mint build\` first`,
    );
  }
  checkMarketplace();

  fs.mkdirSync(OUT, { recursive: true });
  for (const plugin of PLUGINS) {
    const { dest, staged } = stage(plugin);
    const out = generate(plugin, dest);
    const summary = out.split("\n").filter(Boolean).pop() ?? "";
    console.log(
      `${plugin.name.padEnd(16)} ${String(staged).padStart(3)} skills staged — ${summary}`,
    );
  }
  console.log(`\n${PLUGINS.length} plugins generated into ${path.relative(ROOT, OUT)}/`);
}

main();
