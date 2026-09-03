#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_ROOT = join(REPO_ROOT, "packages");
const HOOK_PAYLOAD = (cwd) =>
  `${JSON.stringify({
    session_id: "packed-session-start-gate",
    hook_event_name: "SessionStart",
    source: "startup",
    cwd,
  })}\n`;

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  if (result.error) {
    fail(`${command} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `${command} ${args.join(" ")} exited ${result.status ?? `via ${result.signal}`}\n` +
        `stdout: ${JSON.stringify(result.stdout)}\n` +
        `stderr: ${JSON.stringify(result.stderr)}`,
    );
  }
  return result;
}

function discoverPackages() {
  return readdirSync(PACKAGES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_ROOT, entry.name))
    .filter((packageRoot) => {
      const manifestPath = join(packageRoot, "package.json");
      const hooksPath = join(packageRoot, "hooks", "hooks.json");
      if (!existsSync(manifestPath) || !existsSync(hooksPath)) return false;
      const manifest = readJson(manifestPath);
      return manifest.private !== true;
    })
    .sort();
}

function sessionStartCommands(packageRoot) {
  const hooks = readJson(join(packageRoot, "hooks", "hooks.json"));
  const registrations = hooks.hooks?.SessionStart;
  if (!Array.isArray(registrations)) return [];
  return registrations.flatMap((registration) =>
    Array.isArray(registration.hooks)
      ? registration.hooks
          .filter((hook) => hook?.type === "command" && typeof hook.command === "string")
          .map((hook) => hook.command)
      : [],
  );
}

function pack(packageRoot, packDir) {
  mkdirSync(packDir, { recursive: true });
  const result = run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", packDir], {
    cwd: packageRoot,
    env: { ...process.env, NPM_CONFIG_CACHE: join(packDir, "npm-cache") },
  });
  let records;
  try {
    records = JSON.parse(result.stdout);
  } catch {
    fail(`npm pack returned invalid JSON for ${packageRoot}: ${JSON.stringify(result.stdout)}`);
  }
  const filename = records?.[0]?.filename;
  if (typeof filename !== "string" || filename.length === 0) {
    fail(`npm pack did not report a tarball for ${packageRoot}`);
  }
  return join(packDir, filename);
}

function extractedPackage(tarball, extractDir) {
  mkdirSync(extractDir, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", extractDir]);
  const packageRoot = join(extractDir, "package");
  if (!existsSync(join(packageRoot, "package.json"))) {
    fail(`tarball did not extract an npm package root: ${tarball}`);
  }
  assertNoNodeModules(packageRoot);
  return packageRoot;
}

function assertNoNodeModules(packageRoot) {
  const pending = [packageRoot];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = join(current, entry.name);
      if (entry.name === "node_modules") {
        fail(`packed package unexpectedly contains node_modules: ${child}`);
      }
      pending.push(child);
    }
  }

  let ancestor = packageRoot;
  while (true) {
    if (basename(ancestor) === "node_modules") {
      fail(`packed package is executing beneath node_modules: ${ancestor}`);
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
}

function runHook(packageName, packageRoot, command, sandboxRoot) {
  const cwd = join(sandboxRoot, "cwd");
  const claudeConfig = join(sandboxRoot, "claude-config");
  const codexHome = join(sandboxRoot, "codex-home");
  const crewWorkers = join(sandboxRoot, "crew-workers");
  for (const path of [cwd, claudeConfig, codexHome, crewWorkers]) {
    mkdirSync(path, { recursive: true });
  }

  const env = {
    ...process.env,
    PLUGIN_ROOT: packageRoot,
    CLAUDE_PLUGIN_ROOT: packageRoot,
    CLAUDE_CONFIG_DIR: claudeConfig,
    CODEX_HOME: codexHome,
    MOE_CREW_WORKER_DIR: crewWorkers,
    MOE_GOVERNANCE_MARKER: "",
    MOE_GOVERNANCE_MARKER_CHECK_DISABLED: "1",
  };
  delete env.CURSOR_PLUGIN_ROOT;
  delete env.COPILOT_CLI;
  delete env.MOE_CREW_RUN_ID;
  delete env.MOE_CREW_TMUX_NAME;

  const result = spawnSync("bash", ["-c", command], {
    cwd,
    env,
    input: HOOK_PAYLOAD(cwd),
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    fail(
      `${packageName} SessionStart hook could not run: ${result.error.message}\ncommand: ${command}`,
    );
  }
  if (result.status !== 0 || result.stdout !== "" || result.stderr !== "") {
    fail(
      `${packageName} SessionStart hook violated the Codex contract\n` +
        `command: ${command}\n` +
        `exit: ${result.status ?? `signal ${result.signal}`}\n` +
        `stdout: ${JSON.stringify(result.stdout)}\n` +
        `stderr: ${JSON.stringify(result.stderr)}`,
    );
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), "moe-session-start-hooks-"));

try {
  const tempReal = realpathSync(tempRoot);
  const repoReal = realpathSync(REPO_ROOT);
  if (!relative(repoReal, tempReal).startsWith("..")) {
    fail(`artifact workspace must be outside the repository: ${tempReal}`);
  }

  const packages = discoverPackages();
  if (packages.length === 0) fail("no publishable packages with hooks/hooks.json found");

  let commandCount = 0;
  for (const [index, sourceRoot] of packages.entries()) {
    const sourceManifest = readJson(join(sourceRoot, "package.json"));
    if (
      !Array.isArray(sourceManifest.files) ||
      sourceManifest.files.length === 0 ||
      sourceManifest.files.some((entry) => typeof entry !== "string" || entry.length === 0)
    ) {
      fail(`${sourceManifest.name} package.json files must be a non-empty string array`);
    }
    const commands = sessionStartCommands(sourceRoot);
    if (commands.length === 0) {
      fail(`${sourceManifest.name} has hooks/hooks.json but no SessionStart commands`);
    }

    const packageTemp = join(tempRoot, String(index));
    const tarball = pack(sourceRoot, join(packageTemp, "packs"));
    const packageRoot = extractedPackage(tarball, join(packageTemp, "extracted"));
    if (!existsSync(join(packageRoot, "hooks", "hooks.json"))) {
      fail(`${sourceManifest.name} npm files allowlist omitted hooks/hooks.json`);
    }

    const packedCommands = sessionStartCommands(packageRoot);
    if (packedCommands.length !== commands.length) {
      fail(`${sourceManifest.name} packed SessionStart command count differs from source`);
    }
    for (const [commandIndex, command] of packedCommands.entries()) {
      runHook(sourceManifest.name, packageRoot, command, join(packageTemp, `hook-${commandIndex}`));
      commandCount += 1;
    }
  }

  process.stdout.write(
    `Validated ${commandCount} packed SessionStart commands across ${packages.length} packages.\n`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
