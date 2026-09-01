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
 * generated manifests into `packages/<pkg>/`, and the opencode and pi adapters
 * both emit a FULL-REPLACEMENT `package.json` into the plugin root — which for
 * core would have been `packages/core/package.json`, the pnpm workspace
 * manifest. Historically they were excluded in config with a comment saying
 * "until the plugin root is a staging directory rather than the source tree".
 *
 * So this script stages. For each plugin it wipes `plugins/<name>/`, copies in
 * the config plus the content that plugin ships, and runs
 * `moe-mint generate --dir plugins/<name>`. The plugin root IS the staging
 * directory, the problem dissolves, and moe-mint needed no changes at all.
 *
 * The staging root also used to solve a second problem — two plugins
 * (`moe-core` and `moe-everything`) from one source tree, filtered by tier.
 * That split was retired 2026-09-01 in favour of a single `moe` plugin.
 * `skill-tiers.yaml` is still the fidelity ledger for the imported skill set;
 * it no longer partitions them.
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
 * The plugin registry.
 *
 * `checkMarketplace()` below asserts this list agrees with
 * `.claude-plugin/marketplace.json`, in both directions: a plugin generated but
 * not listed is uninstallable, and one listed but not generated is a broken
 * link. Both fail silently otherwise, which is why it is checked here rather
 * than left to discovery.
 *
 * `distribution` is how installers get the plugin, not how it's staged for
 * generation. Every plugin is generated the same way ("./plugins/<name>/"),
 * but the marketplace listing points elsewhere depending on how a user
 * installs it:
 *
 *   - "local": marketplace listing is "./plugins/<name>", installed from
 *     the checkout (contributor path) or a sparse marketplace clone (main
 *     end-user path for content plugins).
 *   - { npm: "<package-name>" }: marketplace listing is the npm-source
 *     shape `{"source":"npm","package":"…"}`, installed by `claude plugin`
 *     from the `@bubstack` scope. Used for the two MCP-server plugins
 *     (memory, glass) so a native-Windows user gets prebuilt `better-sqlite3`
 *     without an MSVC toolchain — see the installer-hq-dx backlog item.
 *
 * checkMarketplace() below asserts the marketplace listing agrees with each
 * plugin's declared distribution, and rejects any surprise combinations.
 */
const PLUGINS = [
  {
    name: "moe",
    pkg: "core",
    config: "mint/moe.yaml",
    distribution: "local",
  },
  {
    name: "moe-backstory",
    pkg: "backstory",
    config: "mint/moe-backstory.yaml",
    distribution: "local",
  },
  {
    name: "moe-memory",
    pkg: "memory",
    config: "mint/moe-memory.yaml",
    distribution: { npm: "@bubstack/moe-memory" },
  },
  {
    name: "moe-glass",
    pkg: "glass",
    config: "mint/moe-glass.yaml",
    distribution: { npm: "@bubstack/moe-glass" },
  },
  {
    name: "moe-crew",
    pkg: "crew",
    config: "mint/moe-crew.yaml",
    distribution: "local",
  },
];

/**
 * Skill directories that are not skills.
 *
 * `_shared/` holds fragments that skills include; it has no SKILL.md and is in
 * NEITHER of `skill-tiers.yaml`'s maps (not `imported:`, not `authored:`),
 * which is why `packages/core/skills/` has 28 entries for 27 skills. It is
 * excluded from the skill count only; it is still staged with the rest of
 * `skills/`.
 */
const NON_SKILL_ENTRIES = new Set(["_shared"]);

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

/** Cells of a Markdown table row, without the empty outer edges. */
function tableCells(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/**
 * Legal metadata comes from the root NOTICE—the one maintained attribution
 * register.
 */
function readAttributions() {
  const rows = new Map();
  let inImportedWorks = false;
  for (const line of fs.readFileSync(path.join(ROOT, "NOTICE"), "utf8").split(/\r?\n/)) {
    if (line === "## Imported works") {
      inImportedWorks = true;
      continue;
    }
    if (inImportedWorks && line.startsWith("## ")) break;
    if (!inImportedWorks || !line.startsWith("| `")) continue;
    const [rawName, revision, license, copyright] = tableCells(line);
    const name = /^`([^`]+)`$/.exec(rawName ?? "")?.[1];
    if (!name || !revision || !license || !copyright) {
      fail(`malformed imported-work row in NOTICE: ${line}`);
    }
    rows.set(name, { revision, license, copyright });
  }
  if (rows.size === 0) fail("NOTICE has no imported-work rows");
  return rows;
}

/** Package destinations come from PARITY.md rather than a second source list. */
function readDestinations() {
  const rows = new Map();
  let inMap = false;
  for (const line of fs.readFileSync(path.join(ROOT, "PARITY.md"), "utf8").split(/\r?\n/)) {
    if (line === "## Map") {
      inMap = true;
      continue;
    }
    if (inMap && /^#{2,3} /.test(line)) break;
    if (!inMap || !line.startsWith("| `")) continue;
    const [rawName, , , , destination] = tableCells(line);
    const name = /^`([^`]+)`$/.exec(rawName ?? "")?.[1];
    if (!name || !destination) fail(`malformed imported-work row in PARITY.md: ${line}`);
    rows.set(name, destination);
  }
  if (rows.size === 0) fail("PARITY.md has no imported-work rows");
  return rows;
}

/** Generate the legal payload an independently installed plugin receives. */
function writePluginLicense(plugin, dest) {
  const attributions = readAttributions();
  const packagePath = `packages/${plugin.pkg}`;
  const sources = [...readDestinations()]
    .filter(([, destination]) => destination.includes(packagePath))
    .map(([source]) => source);
  if (sources.length === 0) fail(`${plugin.name} has no imported works recorded in PARITY.md`);

  const rows = sources.map((source) => {
    const row = attributions.get(source);
    if (!row) fail(`${plugin.name} names ${source}, which NOTICE does not account for`);
    return row;
  });

  const unlicensed = rows.filter((row) => row.license.startsWith("No license"));
  if (unlicensed.length > 0) {
    fail(`${plugin.name} includes material with no located license grant`);
  }

  const sections = [];
  const mitRows = rows.filter((row) => row.license.startsWith("MIT"));
  if (mitRows.length > 0) {
    const template = fs.readFileSync(path.join(ROOT, "LICENSE-MIT"), "utf8");
    const termsAt = template.indexOf("Permission is hereby granted");
    if (termsAt === -1) fail("LICENSE-MIT is missing the MIT permission terms");
    const copyrights = [...new Set(mitRows.map((row) => row.copyright.split(";")[0].trim()))];
    sections.push(`MIT License\n\n${copyrights.join("\n")}\n\n${template.slice(termsAt).trim()}`);
  }

  if (rows.some((row) => row.license.startsWith("Apache-2.0"))) {
    sections.push(fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8").trim());
  }

  if (rows.some((row) => row.license === "Public domain")) {
    sections.push(
      "Public-domain material\n\nThis distribution includes material identified as public domain in the root NOTICE.",
    );
  }

  if (sections.length === 0) fail(`${plugin.name} resolved no distributable license text`);
  fs.writeFileSync(path.join(dest, "LICENSE"), `${sections.join("\n\n---\n\n")}\n`);
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

  let staged = 0;

  for (const component of COMPONENTS) {
    const src = path.join(pkgDir, component);
    if (!fs.existsSync(src)) continue;
    copyInto(src, path.join(dest, component));
    if (component === "skills") {
      staged += fs.readdirSync(src).filter((entry) => !NON_SKILL_ENTRIES.has(entry)).length;
    }
  }

  writePluginLicense(plugin, dest);

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
/** Human-readable string form of the two accepted marketplace `source`
 *  shapes, for diffing in the error message. */
function describeSource(source) {
  if (typeof source === "string") return JSON.stringify(source);
  if (source && typeof source === "object" && source.source === "npm") {
    return `{ source: "npm", package: ${JSON.stringify(source.package)} }`;
  }
  return JSON.stringify(source);
}

/** The `source` value the marketplace listing must carry for the given
 *  plugin registry entry, derived from `distribution` above. */
function expectedSource(plugin) {
  if (plugin.distribution === "local") return `./plugins/${plugin.name}`;
  if (plugin.distribution?.npm) {
    return { source: "npm", package: plugin.distribution.npm };
  }
  fail(`unknown distribution for ${plugin.name}: ${JSON.stringify(plugin.distribution)}`);
}

/** Two `source` values agree. Object shape only — no deep-merge tolerance. */
function sourcesMatch(actual, expected) {
  if (typeof expected === "string") return actual === expected;
  if (!actual || typeof actual !== "object") return false;
  return actual.source === expected.source && actual.package === expected.package;
}

function checkMarketplace() {
  const file = path.join(ROOT, ".claude-plugin/marketplace.json");
  const listed = JSON.parse(fs.readFileSync(file, "utf8")).plugins ?? [];
  const listedNames = new Set(listed.map((p) => p.name));
  const built = new Map(PLUGINS.map((p) => [p.name, p]));

  const problems = [];
  for (const name of built.keys()) {
    if (!listedNames.has(name))
      problems.push(`${name} is generated but absent from marketplace.json`);
  }
  for (const entry of listed) {
    const plugin = built.get(entry.name);
    if (!plugin) {
      problems.push(`${entry.name} is in marketplace.json but nothing generates it`);
      continue;
    }
    const expected = expectedSource(plugin);
    if (!sourcesMatch(entry.source, expected)) {
      problems.push(
        `${entry.name}: marketplace source is ${describeSource(entry.source)}, expected ${describeSource(expected)}`,
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
