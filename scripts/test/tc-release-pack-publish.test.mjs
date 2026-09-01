import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { MANIFEST_IDENTITIES, PRIVATE_FLIGHT_MANIFESTS } from "../check-downstream-scope.mjs";
import { REQUIRED_PLUGIN_FILES } from "../tc-release-compose.mjs";
import { EXPECTED_RELEASE_PACKAGES, packRelease } from "../tc-release-pack.mjs";
import { publishRelease } from "../tc-release-publish.mjs";
import { PROGET_REGISTRY } from "../tc-release-validate.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const VERSION = "1.2.3-tc.4";
const PRIOR_VERSION = "1.2.3-tc.3";
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function write(path, content = "fixture\n") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function packageManifest(name, extras = {}) {
  return {
    name,
    version: VERSION,
    type: "module",
    moeRelease: { upstreamVersion: "1.2.3", upstreamCommit: SHA },
    publishConfig: { registry: PROGET_REGISTRY },
    ...extras,
  };
}

function runtimeExtras(kind) {
  return {
    main: "dist/index.js",
    ...(kind === "memory" ? { types: "dist/index.d.ts" } : {}),
    bin: { [`moe-${kind}`]: "./dist/cli.js" },
    dependencies: { "runtime-only": "1.0.0" },
    keywords: ["runtime", "shared"],
  };
}

function writeRuntimePayload(root, kind) {
  const packageRoot = join(root, "packages", kind);
  write(join(packageRoot, "dist/index.js"), "export {};\n");
  write(join(packageRoot, "dist/cli.js"), "#!/usr/bin/env node\n");
  if (kind === "memory") {
    write(join(packageRoot, "dist/index.d.ts"), "export {};\n");
    writeJson(join(packageRoot, "hooks/hooks.json"), {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                command: `node "\${PLUGIN_ROOT:-\${CLAUDE_PLUGIN_ROOT}}/dist/cli.js" sync --background`,
              },
            ],
          },
        ],
      },
    });
  }
}

function writeGeneratedPlugin(root, kind) {
  const pluginRoot = join(root, "plugins", `moe-${kind}`);
  for (const path of REQUIRED_PLUGIN_FILES[kind]) write(join(pluginRoot, path));
  writeJson(join(pluginRoot, "package.json"), {
    name: `moe-${kind}`,
    version: "9.9.9",
    main: `./.opencode/plugins/moe-${kind}.js`,
    dependencies: { "generated-only": "9.9.9" },
    publishConfig: { registry: "https://registry.npmjs.org/" },
    pi: {
      extensions: [`./.pi/extensions/moe-${kind}.ts`],
      skills: ["./skills"],
    },
    keywords: ["shared", "generated", "pi-package"],
  });
  writeJson(join(pluginRoot, ".claude-plugin/plugin.json"), {
    name: `moe-${kind}`,
    ...(kind === "memory" ? { hooks: "./hooks/moe-mint/hooks.json" } : {}),
  });
  writeJson(join(pluginRoot, ".moe-mint/manifest.json"), { schema: 1, files: {} });
  if (kind === "memory") {
    const runtime = {
      matcher: "startup|resume|clear",
      hooks: [
        {
          type: "command",
          command: `node "\${PLUGIN_ROOT:-\${CLAUDE_PLUGIN_ROOT}}/dist/cli.js" sync --background`,
        },
      ],
    };
    const bootstrap = {
      matcher: "startup|clear|compact",
      hooks: [
        {
          type: "command",
          command: `"\${CLAUDE_PLUGIN_ROOT}/hooks/moe-mint/run-hook.cmd" session-start`,
          shell: "bash",
          async: false,
        },
      ],
    };
    writeJson(join(pluginRoot, "hooks/hooks.json"), {
      hooks: { SessionStart: [runtime] },
    });
    writeJson(join(pluginRoot, "hooks/moe-mint/hooks.json"), {
      hooks: { SessionStart: [runtime, bootstrap] },
    });
  }
}

function releaseFixture() {
  const root = mkdtempSync(join(tmpdir(), "moe-release-pipeline-"));
  roots.push(root);
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    "packages:\n  - 'packages/*'\n  - 'packages/tab/bindings/typescript'\n",
  );
  writeJson(join(root, "tc-release.json"), {
    upstreamVersion: "1.2.3",
    upstreamCommit: SHA,
    tcRelease: 4,
  });
  for (const [path, name] of Object.entries(MANIFEST_IDENTITIES)) {
    const kind = name === "@tc/moe-memory" ? "memory" : name === "@tc/moe-glass" ? "glass" : null;
    writeJson(
      join(root, path),
      packageManifest(name, {
        ...(PRIVATE_FLIGHT_MANIFESTS.includes(path) ? { private: true } : {}),
        ...(kind ? runtimeExtras(kind) : {}),
      }),
    );
    if (kind) writeRuntimePayload(root, kind);
  }
  writeGeneratedPlugin(root, "memory");
  writeGeneratedPlugin(root, "glass");
  return root;
}

function artifactName(name) {
  return `${name.slice(1).replaceAll("/", "-")}-${VERSION}.tgz`;
}

function fakePackRunner({ mutatePacked } = {}) {
  const manifests = new Map();
  const archives = new Map();
  const calls = [];
  const snapshot = (directory) => {
    const contents = new Map();
    const visit = (relative = "") => {
      for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) visit(path);
        else contents.set(path, readFileSync(join(directory, path)));
      }
    };
    visit();
    const packed = JSON.parse(contents.get("package.json").toString("utf8"));
    mutatePacked?.(packed);
    contents.set("package.json", Buffer.from(`${JSON.stringify(packed, null, 2)}\n`));
    return { contents, manifest: packed };
  };
  const runCommand = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "pnpm") {
      assert.equal(options.env.PROGET_NPM_AUTH, undefined);
      const archive = snapshot(options.cwd);
      const outputDirectory = args[args.indexOf("--pack-destination") + 1];
      const filename = artifactName(archive.manifest.name);
      writeFileSync(join(outputDirectory, filename), "fake tarball");
      manifests.set(filename, archive.manifest);
      archives.set(resolve(outputDirectory, filename), archive);
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "tar") {
      const archive = archives.get(resolve(args[1]));
      if (!archive) return { status: 1, stdout: "", stderr: "missing fake archive" };
      if (args[0] === "-xzf") {
        const destination = args[args.indexOf("-C") + 1];
        for (const [path, content] of archive.contents) {
          write(join(destination, "package", path), content);
        }
        return { status: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "-tzf") {
        return {
          status: 0,
          stdout: [...archive.contents.keys()].map((path) => `package/${path}`).join("\n"),
          stderr: "",
        };
      }
      const path = args[2]?.replace(/^package\//u, "");
      const content = archive.contents.get(path);
      return content
        ? { status: 0, stdout: content.toString("utf8"), stderr: "" }
        : { status: 1, stdout: "", stderr: `missing ${path}` };
    }
    throw new Error(`unexpected command ${command}`);
  };
  return { calls, manifests, runCommand };
}

function releaseInput(root, extras = {}) {
  return {
    root,
    branch: "main",
    defaultBranch: "main",
    distTag: "latest",
    authPresent: true,
    env: { ...process.env, PROGET_NPM_AUTH: "must-not-reach-pack-processes" },
    ...extras,
  };
}

function makePackedArtifacts(root, mutatePacked) {
  const artifactsDir = join(root, "artifacts");
  mkdirSync(artifactsDir);
  const manifests = new Map();
  for (const expected of EXPECTED_RELEASE_PACKAGES) {
    const filename = artifactName(expected.name);
    const manifest = packageManifest(expected.name, {
      ...(expected.pluginKind ? runtimeExtras(expected.pluginKind) : {}),
    });
    mutatePacked?.(manifest);
    writeFileSync(join(artifactsDir, filename), `fake tarball for ${expected.name}`);
    manifests.set(filename, manifest);
  }
  return { artifactsDir, manifests };
}

function publishedArchive(expected, manifest) {
  const contents = new Map([["package.json", JSON.stringify(manifest)]]);
  if (!expected.pluginKind) return contents;
  for (const path of REQUIRED_PLUGIN_FILES[expected.pluginKind]) contents.set(path, "fixture\n");
  contents.set("dist/index.js", "export {};\n");
  contents.set("dist/cli.js", "#!/usr/bin/env node\n");
  if (expected.pluginKind === "memory") contents.set("dist/index.d.ts", "export {};\n");
  contents.set(
    ".claude-plugin/plugin.json",
    JSON.stringify({
      name: `moe-${expected.pluginKind}`,
      ...(expected.pluginKind === "memory" ? { hooks: "./hooks/moe-mint/hooks.json" } : {}),
    }),
  );
  if (expected.pluginKind === "memory") {
    const runtime = {
      command: `node "\${PLUGIN_ROOT:-\${CLAUDE_PLUGIN_ROOT}}/dist/cli.js" sync --background`,
    };
    const bootstrap = {
      command: `"\${CLAUDE_PLUGIN_ROOT}/hooks/moe-mint/run-hook.cmd" session-start`,
    };
    contents.set(
      "hooks/hooks.json",
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [runtime] }] } }),
    );
    contents.set(
      "hooks/moe-mint/hooks.json",
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [runtime, bootstrap] }] } }),
    );
  }
  return contents;
}

function integrity(path) {
  return `sha512-${createHash("sha512").update(readFileSync(path)).digest("base64")}`;
}

function packageFromSpec(spec, suffix) {
  assert.ok(spec.endsWith(suffix), `${spec} should end with ${suffix}`);
  return spec.slice(0, -suffix.length);
}

function registryRunner({
  artifactsDir,
  manifests,
  exactState = "missing",
  latestState = PRIOR_VERSION,
  onOperation,
}) {
  const tarballByName = new Map(
    EXPECTED_RELEASE_PACKAGES.map((expected) => [
      expected.name,
      join(artifactsDir, artifactName(expected.name)),
    ]),
  );
  const exact = new Map();
  const latest = new Map();
  for (const expected of EXPECTED_RELEASE_PACKAGES) {
    const configuredExact = exactState instanceof Map ? exactState.get(expected.name) : exactState;
    exact.set(
      expected.name,
      configuredExact === "matching"
        ? integrity(tarballByName.get(expected.name))
        : configuredExact === "missing"
          ? null
          : configuredExact,
    );
    latest.set(
      expected.name,
      latestState instanceof Map ? latestState.get(expected.name) : latestState,
    );
  }

  const calls = [];
  const npmrcPaths = new Set();
  const operationCounts = new Map();
  const json = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
  const notFound = () => ({
    status: 1,
    stdout: JSON.stringify({ error: { code: "E404", summary: "not found" } }),
    stderr: "",
  });

  const runCommand = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "tar") {
      assert.equal(options.env.PROGET_NPM_AUTH, undefined);
      const manifest = manifests.get(basename(args[1]));
      const expected = EXPECTED_RELEASE_PACKAGES.find(
        (candidate) => candidate.name === manifest.name,
      );
      const contents = publishedArchive(expected, manifest);
      if (args[0] === "-tzf") {
        return {
          status: 0,
          stdout: [...contents.keys()].map((path) => `package/${path}`).join("\n"),
          stderr: "",
        };
      }
      const path = args[2].replace(/^package\//u, "");
      const content = contents.get(path);
      return content === undefined
        ? { status: 1, stdout: "", stderr: `missing ${path}` }
        : { status: 0, stdout: content, stderr: "" };
    }
    assert.equal(command, "npm");
    assert.equal(calls.filter((call) => call.command === "tar").length, 16);
    assert.equal(options.env.PROGET_NPM_AUTH, undefined);
    assert.equal(options.env.NODE_AUTH_TOKEN, undefined);
    const npmrc = args[args.indexOf("--userconfig") + 1];
    npmrcPaths.add(npmrc);
    assert.equal(statSync(npmrc).mode & 0o777, 0o600);
    assert.match(readFileSync(npmrc, "utf8"), /_auth=super-secret/);

    let operation;
    let name;
    if (args[0] === "view" && args[2] === "dist.integrity") {
      operation = "view-exact";
      name = packageFromSpec(args[1], `@${VERSION}`);
    } else if (args[0] === "view" && args[2] === "version") {
      operation = "view-latest";
      name = packageFromSpec(args[1], "@latest");
    } else if (args[0] === "publish") {
      operation = "publish";
      name = manifests.get(basename(args.at(-1))).name;
    } else if (args[0] === "dist-tag" && args[1] === "add") {
      operation = "tag-add";
      name = args[2].slice(0, args[2].lastIndexOf("@"));
    } else if (args[0] === "dist-tag" && args[1] === "rm") {
      operation = "tag-rm";
      name = args[2];
    } else {
      throw new Error(`unexpected npm command: ${args.join(" ")}`);
    }
    const occurrence = (operationCounts.get(operation) ?? 0) + 1;
    operationCounts.set(operation, occurrence);
    const overridden = onOperation?.({
      operation,
      name,
      occurrence,
      args,
      exact,
      latest,
    });
    if (overridden !== undefined) return overridden;

    if (operation === "view-exact") {
      return exact.get(name) === null ? notFound() : json(exact.get(name));
    }
    if (operation === "view-latest") {
      return latest.get(name) == null ? notFound() : json(latest.get(name));
    }
    if (operation === "publish") {
      exact.set(name, integrity(tarballByName.get(name)));
      return { status: 0, stdout: "", stderr: "" };
    }
    if (operation === "tag-add") {
      latest.set(name, args[2].slice(args[2].lastIndexOf("@") + 1));
      return { status: 0, stdout: "", stderr: "" };
    }
    latest.set(name, null);
    return { status: 0, stdout: "", stderr: "" };
  };

  return { calls, exact, latest, npmrcPaths, operationCounts, runCommand };
}

function publishInput(root, artifactsDir, runCommand, extras = {}) {
  return {
    root,
    artifactsDir,
    branch: "main",
    defaultBranch: "main",
    mergeRequest: false,
    distTag: "latest",
    protectedRef: true,
    pipelineSource: "push",
    auth: "super-secret",
    env: {
      ...process.env,
      PROGET_NPM_AUTH: "super-secret",
      NODE_AUTH_TOKEN: "also-secret",
    },
    runCommand,
    ...extras,
  };
}

function mutations(calls) {
  return calls.filter(
    (call) => call.command === "npm" && ["publish", "dist-tag"].includes(call.args[0]),
  );
}

describe("TC release packing", () => {
  it("packs and inspects exactly the eight release artifacts without exposing auth", () => {
    const root = releaseFixture();
    const artifactsDir = join(root, "artifacts");
    const fake = fakePackRunner();

    const result = packRelease({
      ...releaseInput(root),
      outputDir: artifactsDir,
      runCommand: fake.runCommand,
    });

    assert.equal(result.artifacts.length, 8);
    assert.equal(readdirSync(artifactsDir).filter((entry) => entry.endsWith(".tgz")).length, 8);
    const packCalls = fake.calls.filter((call) => call.command === "pnpm");
    assert.equal(packCalls.length, 10);
    assert.equal(
      packCalls.filter((call) => call.args[0] === "--config.ignore-scripts=true").length,
      2,
    );
    const seedDirectories = new Set(
      packCalls
        .map((call) => call.args[call.args.indexOf("--pack-destination") + 1])
        .filter((destination) => destination !== artifactsDir),
    );
    assert.equal(seedDirectories.size, 1);
    for (const directory of seedDirectories) assert.equal(existsSync(directory), false);
    for (const call of packCalls.filter(
      (call) => call.args[0] === "--config.ignore-scripts=true",
    )) {
      assert.equal(existsSync(call.options.cwd), false);
    }
    assert.deepEqual(
      result.artifacts.map((artifact) => artifact.manifest.name),
      EXPECTED_RELEASE_PACKAGES.map((pkg) => pkg.name),
    );
    for (const kind of ["glass", "memory"]) {
      const artifact = result.artifacts.find(
        (candidate) => candidate.manifest.name === `@tc/moe-${kind}`,
      );
      assert.ok(artifact.pluginPayload);
      assert.deepEqual(artifact.manifest.dependencies, { "runtime-only": "1.0.0" });
      assert.equal(artifact.manifest.dependencies["generated-only"], undefined);
      assert.deepEqual(artifact.manifest.keywords, [
        "runtime",
        "shared",
        "generated",
        "pi-package",
      ]);
    }
  });

  it("runs source validation before starting any pack command", () => {
    const root = releaseFixture();
    const fake = fakePackRunner();
    const rootManifest = packageManifest("@tc/moe", { version: "1.2.3-tc.3" });
    writeJson(join(root, "package.json"), rootManifest);

    assert.throws(
      () =>
        packRelease({
          ...releaseInput(root),
          outputDir: join(root, "artifacts"),
          runCommand: fake.runCommand,
        }),
      /release validation failed/,
    );
    assert.equal(fake.calls.length, 0);
  });

  it("aborts before pack when an active install surface leaks an upstream identity", () => {
    const root = releaseFixture();
    const fake = fakePackRunner();
    writeFileSync(join(root, "INSTALL.md"), "Install with `npx @bubstack/moe install`.\n");

    assert.throws(
      () =>
        packRelease({
          ...releaseInput(root),
          outputDir: join(root, "artifacts"),
          runCommand: fake.runCommand,
        }),
      /downstream scope check failed.*scope\.upstream-leak/s,
    );
    assert.equal(fake.calls.length, 0);
  });

  it("cleans source seed artifacts when composed payload validation fails", () => {
    const root = releaseFixture();
    const artifactsDir = join(root, "artifacts");
    writeJson(join(root, "plugins/moe-memory/hooks/moe-mint/hooks.json"), {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                command: `node "\${PLUGIN_ROOT:-\${CLAUDE_PLUGIN_ROOT}}/dist/cli.js" sync --background`,
              },
            ],
          },
        ],
      },
    });
    const fake = fakePackRunner();

    assert.throws(
      () =>
        packRelease({
          ...releaseInput(root),
          outputDir: artifactsDir,
          runCommand: fake.runCommand,
        }),
      /memory plugin payload has no bootstrap session-start command/,
    );
    const seedDirectories = new Set(
      fake.calls
        .filter((call) => call.command === "pnpm")
        .map((call) => call.args[call.args.indexOf("--pack-destination") + 1])
        .filter((destination) => destination !== artifactsDir),
    );
    assert.equal(seedDirectories.size, 1);
    for (const directory of seedDirectories) assert.equal(existsSync(directory), false);
  });

  it("rejects downstream identity and unresolved workspace ranges in packed manifests", () => {
    const root = releaseFixture();
    const fake = fakePackRunner({
      mutatePacked(manifest) {
        if (manifest.name === "@tc/moe-core") {
          manifest.dependencies = { "@bubstack/moe-memory": "workspace:*" };
        }
      },
    });

    assert.throws(
      () =>
        packRelease({
          ...releaseInput(root),
          outputDir: join(root, "artifacts"),
          runCommand: fake.runCommand,
        }),
      /leaks an @bubstack identity|retains workspace:/,
    );
    assert.equal(fake.calls.filter((call) => call.command === "pnpm").length, 10);
  });
});

describe("TC release publishing", () => {
  it("uploads only missing exact versions, verifies the train, and promotes umbrella last", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const registry = registryRunner({ artifactsDir, manifests });

    const result = publishRelease(publishInput(root, artifactsDir, registry.runCommand));

    const publishes = registry.calls.filter(
      (call) => call.command === "npm" && call.args[0] === "publish",
    );
    const tagAdds = registry.calls.filter(
      (call) => call.command === "npm" && call.args[0] === "dist-tag" && call.args[1] === "add",
    );
    const firstMutationIndex = registry.calls.findIndex(
      (call) => call.command === "npm" && ["publish", "dist-tag"].includes(call.args[0]),
    );
    const preflightCalls = registry.calls.slice(0, firstMutationIndex);
    assert.equal(
      preflightCalls.filter((call) => call.command === "npm" && call.args[2] === "dist.integrity")
        .length,
      8,
    );
    assert.equal(
      preflightCalls.filter((call) => call.command === "npm" && call.args[2] === "version").length,
      8,
    );
    assert.equal(publishes.length, 8);
    assert.ok(
      publishes.every(
        (call) => call.args[call.args.indexOf("--tag") + 1] === "tc-candidate-1-2-3-tc-4",
      ),
    );
    assert.equal(tagAdds.length, 8);
    assert.equal(tagAdds.at(-1).args[2], `@tc/moe@${VERSION}`);
    assert.deepEqual([...registry.latest.values()], Array(8).fill(VERSION));
    assert.equal(result.uploaded.length, 8);
    assert.equal(result.noOp, false);
    for (const npmrc of registry.npmrcPaths) assert.equal(existsSync(npmrc), false);
  });

  it("skips uploads on a matching retry and performs no registry writes when already complete", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const retry = registryRunner({
      artifactsDir,
      manifests,
      exactState: "matching",
      latestState: PRIOR_VERSION,
    });
    const retryResult = publishRelease(publishInput(root, artifactsDir, retry.runCommand));
    assert.equal(
      retry.calls.some((call) => call.command === "npm" && call.args[0] === "publish"),
      false,
    );
    assert.equal(retryResult.uploaded.length, 0);
    assert.equal(retry.operationCounts.get("tag-add"), 8);

    const complete = registryRunner({
      artifactsDir,
      manifests,
      exactState: "matching",
      latestState: VERSION,
    });
    const completeResult = publishRelease(publishInput(root, artifactsDir, complete.runCommand));
    assert.equal(mutations(complete.calls).length, 0);
    assert.equal(completeResult.noOp, true);
  });

  it("fails closed with zero mutation for mismatched or unverifiable exact versions", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const mismatchState = new Map(
      EXPECTED_RELEASE_PACKAGES.map((expected) => [expected.name, "matching"]),
    );
    mismatchState.set("@tc/moe-core", "sha512-different");
    const mismatch = registryRunner({
      artifactsDir,
      manifests,
      exactState: mismatchState,
    });
    assert.throws(
      () => publishRelease(publishInput(root, artifactsDir, mismatch.runCommand)),
      /integrity mismatch/,
    );
    assert.equal(mutations(mismatch.calls).length, 0);
    for (const npmrc of mismatch.npmrcPaths) assert.equal(existsSync(npmrc), false);

    const uncertain = registryRunner({
      artifactsDir,
      manifests,
      onOperation({ operation, occurrence }) {
        if (operation === "view-exact" && occurrence === 1) {
          return { status: 503, stdout: "", stderr: "registry unavailable" };
        }
      },
    });
    assert.throws(
      () => publishRelease(publishInput(root, artifactsDir, uncertain.runCommand)),
      /could not be verified/,
    );
    assert.equal(mutations(uncertain.calls).length, 0);
  });

  it("rejects mixed prior latest tags and a target older than coherent latest", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const mixedLatest = new Map(
      EXPECTED_RELEASE_PACKAGES.map((expected) => [expected.name, PRIOR_VERSION]),
    );
    mixedLatest.set("@tc/moe", null);
    const mixed = registryRunner({ artifactsDir, manifests, latestState: mixedLatest });
    assert.throws(
      () => publishRelease(publishInput(root, artifactsDir, mixed.runCommand)),
      /latest tags are mixed/,
    );
    assert.equal(mutations(mixed.calls).length, 0);

    const newer = registryRunner({
      artifactsDir,
      manifests,
      latestState: "1.2.3-tc.5",
    });
    assert.throws(
      () => publishRelease(publishInput(root, artifactsDir, newer.runCommand)),
      /older than prior coherent latest/,
    );
    assert.equal(mutations(newer.calls).length, 0);
  });

  it("rejects every unsafe publish context before running a command", () => {
    const root = releaseFixture();
    const { artifactsDir } = makePackedArtifacts(root);
    const cases = [
      { protectedRef: false },
      { pipelineSource: "schedule" },
      { branch: "feature/release" },
      { mergeRequest: true },
      { distTag: "next" },
      { auth: "" },
      { auth: "secret\n_auth=other" },
    ];
    for (const extras of cases) {
      let commands = 0;
      assert.throws(
        () =>
          publishRelease(
            publishInput(
              root,
              artifactsDir,
              () => {
                commands++;
                return { status: 0, stdout: "", stderr: "" };
              },
              extras,
            ),
          ),
        /unsafe publish context/,
      );
      assert.equal(commands, 0);
    }
  });

  it("does not move latest when an upload fails", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const registry = registryRunner({
      artifactsDir,
      manifests,
      onOperation({ operation, occurrence }) {
        if (operation === "publish" && occurrence === 5) {
          return { status: 1, stdout: "", stderr: "upload failed" };
        }
      },
    });

    assert.throws(
      () => publishRelease(publishInput(root, artifactsDir, registry.runCommand)),
      /publish .* failed/,
    );
    assert.equal(registry.operationCounts.get("publish"), 5);
    assert.equal(registry.operationCounts.get("tag-add") ?? 0, 0);
    assert.deepEqual([...registry.latest.values()], Array(8).fill(PRIOR_VERSION));
  });

  it("rolls a failed promotion back in reverse order", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const registry = registryRunner({
      artifactsDir,
      manifests,
      exactState: "matching",
      onOperation({ operation, occurrence }) {
        if (operation === "tag-add" && occurrence === 4) {
          return { status: 1, stdout: "", stderr: "tag failed" };
        }
      },
    });

    assert.throws(
      () => publishRelease(publishInput(root, artifactsDir, registry.runCommand)),
      /latest rollback verified/,
    );
    const tagAdds = registry.calls
      .filter(
        (call) => call.command === "npm" && call.args[0] === "dist-tag" && call.args[1] === "add",
      )
      .map((call) => call.args[2]);
    assert.deepEqual(tagAdds.slice(-3), [
      `@tc/moe-crew@${PRIOR_VERSION}`,
      `@tc/moe-core@${PRIOR_VERSION}`,
      `@tc/moe-backstory@${PRIOR_VERSION}`,
    ]);
    assert.deepEqual([...registry.latest.values()], Array(8).fill(PRIOR_VERSION));
  });

  it("removes newly created latest tags while rolling back a train with no prior latest", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const registry = registryRunner({
      artifactsDir,
      manifests,
      exactState: "matching",
      latestState: null,
      onOperation({ operation, occurrence }) {
        if (operation === "tag-add" && occurrence === 3) {
          return { status: 1, stdout: "", stderr: "tag failed" };
        }
      },
    });

    assert.throws(
      () => publishRelease(publishInput(root, artifactsDir, registry.runCommand)),
      /latest rollback verified/,
    );
    const removals = registry.calls
      .filter(
        (call) => call.command === "npm" && call.args[0] === "dist-tag" && call.args[1] === "rm",
      )
      .map((call) => call.args[2]);
    assert.deepEqual(removals, ["@tc/moe-core", "@tc/moe-backstory"]);
    assert.deepEqual([...registry.latest.values()], Array(8).fill(null));
  });
});
