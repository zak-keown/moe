import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  assertRequiredPluginPayload,
  composePluginTarball,
  inspectPluginTarball,
  REQUIRED_EXECUTABLE_PLUGIN_FILES,
  REQUIRED_PLUGIN_FILES,
} from "../tc-release-compose.mjs";

const VERSION = "1.2.3-tc.4";
const SECRET_ENVIRONMENT = Object.freeze({
  PROGET_NPM_AUTH: "proget-secret",
  CI_JOB_TOKEN: "gitlab-job-secret",
  TC_GITLAB_TOKEN: "gitlab-api-secret",
  DATABASE_PASSWORD: "database-secret",
  FUTURE_SERVICE_SECRET: "future-secret",
  SIGNING_PRIVATE_KEY: "signing-key",
  SSH_AUTH_SOCK: "/tmp/agent.sock",
  AWS_ACCESS_KEY_ID: "aws-access-key",
  AWS_SECRET_ACCESS_KEY: "aws-secret-key",
  AWS_SESSION_TOKEN: "aws-session-token",
  AZURE_CLIENT_SECRET: "azure-secret",
  GOOGLE_APPLICATION_CREDENTIALS: "/tmp/google-credentials.json",
});
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "moe-compose-test-"));
  roots.push(root);
  return root;
}

function write(path, content = "fixture\n") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(path, value) {
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assertSecretFree(environment) {
  for (const [name, value] of Object.entries(SECRET_ENVIRONMENT)) {
    assert.equal(Object.hasOwn(environment, name), false, `${name} survived sanitization`);
    assert.equal(Object.values(environment).includes(value), false, `${name} value leaked`);
  }
}

function runtimeManifest(kind) {
  const name = `@tc/moe-${kind}`;
  const manifest = {
    name,
    version: VERSION,
    type: "module",
    description: `runtime ${kind}`,
    main: "dist/index.js",
    bin: { [`moe-${kind}`]: "./dist/cli.js" },
    dependencies: { zod: "^4.0.0" },
    publishConfig: { registry: "https://proget.tcdevops.com/npm/tcnpm/" },
    moeRelease: { upstreamVersion: "1.2.3", upstreamCommit: "a".repeat(40) },
    keywords: ["runtime", "shared"],
    files: ["dist"],
    scripts: { prepack: "node should-not-run.js" },
  };
  if (kind === "memory") manifest.types = "dist/index.d.ts";
  return manifest;
}

function seedFixture(root, kind, { omitRuntimeBin = false } = {}) {
  const packageDirectory = join(root, `seed-${kind}`, "package");
  writeJson(join(packageDirectory, "package.json"), runtimeManifest(kind));
  write(join(packageDirectory, "dist/index.js"), "export {};\n");
  if (kind === "memory") write(join(packageDirectory, "dist/index.d.ts"), "export {};\n");
  if (!omitRuntimeBin) write(join(packageDirectory, "dist/cli.js"), "#!/usr/bin/env node\n");
  if (kind === "memory") {
    writeJson(join(packageDirectory, "hooks/hooks.json"), {
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
  const tarball = join(root, `${kind}-seed.tgz`);
  const packed = spawnSync("tar", ["-czf", tarball, "-C", dirname(packageDirectory), "package"], {
    encoding: "utf8",
  });
  assert.equal(packed.status, 0, packed.stderr);
  return tarball;
}

function memoryMergedHooks({ bootstrap = true } = {}) {
  const sessionStart = [
    {
      matcher: "startup|resume|clear",
      hooks: [
        {
          type: "command",
          command: `node "\${PLUGIN_ROOT:-\${CLAUDE_PLUGIN_ROOT}}/dist/cli.js" sync --background`,
        },
      ],
    },
  ];
  if (bootstrap) {
    sessionStart.push({
      matcher: "startup|clear|compact",
      hooks: [
        {
          type: "command",
          command: `"\${CLAUDE_PLUGIN_ROOT}/hooks/moe-mint/run-hook.cmd" session-start`,
          shell: "bash",
          async: false,
        },
      ],
    });
  }
  return { hooks: { SessionStart: sessionStart } };
}

function generatedPluginFixture(root, kind, { bootstrap = true } = {}) {
  const pluginDirectory = join(root, `plugin-${kind}`);
  for (const path of REQUIRED_PLUGIN_FILES[kind]) write(join(pluginDirectory, path));
  for (const path of REQUIRED_EXECUTABLE_PLUGIN_FILES[kind]) {
    const executable = join(pluginDirectory, path);
    write(executable, "#!/bin/sh\nexit 0\n");
    chmodSync(executable, 0o755);
  }
  const generatedName = `moe-${kind}`;
  writeJson(join(pluginDirectory, "package.json"), {
    name: generatedName,
    version: "9.9.9",
    main: `./.opencode/plugins/${generatedName}.js`,
    dependencies: { "generated-only": "latest" },
    publishConfig: { registry: "https://registry.npmjs.org/" },
    scripts: { preinstall: "false" },
    pi: {
      extensions: [`./.pi/extensions/${generatedName}.ts`],
      skills: ["./skills"],
    },
    keywords: ["shared", "generated", "pi-package"],
  });
  writeJson(join(pluginDirectory, ".claude-plugin/plugin.json"), {
    name: generatedName,
    ...(kind === "memory" ? { hooks: "./hooks/moe-mint/hooks.json" } : {}),
  });
  writeJson(join(pluginDirectory, ".moe-mint/manifest.json"), {
    schema: 1,
    files: {},
  });
  if (kind === "memory") {
    writeJson(join(pluginDirectory, "hooks/hooks.json"), memoryMergedHooks({ bootstrap: false }));
    writeJson(join(pluginDirectory, "hooks/moe-mint/hooks.json"), memoryMergedHooks({ bootstrap }));
  }
  return pluginDirectory;
}

function fakeCommandRunner({ failPack = false } = {}) {
  const calls = [];
  let packDirectory;
  const runCommand = (command, args, options = {}) => {
    calls.push({ command, args, options });
    assertSecretFree(options.env);
    if (command === "tar") return spawnSync(command, args, { encoding: "utf8", ...options });
    assert.equal(command, "pnpm");
    packDirectory = options.cwd;
    assert.deepEqual(args.slice(0, 2), ["--config.ignore-scripts=true", "pack"]);
    assert.equal(options.env.npm_config_ignore_scripts, undefined);
    assert.equal(options.env.NPM_CONFIG_IGNORE_SCRIPTS, "true");
    assert.equal(options.env.PROGET_NPM_AUTH, undefined);
    if (failPack) return { status: 1, stdout: "", stderr: "deliberate failure" };
    const manifest = JSON.parse(readFileSync(join(options.cwd, "package.json"), "utf8"));
    const destination = args[args.indexOf("--pack-destination") + 1];
    const filename = `${manifest.name.slice(1).replaceAll("/", "-")}-${manifest.version}.tgz`;
    return spawnSync(
      "tar",
      ["-czf", join(destination, filename), "-C", dirname(options.cwd), basename(options.cwd)],
      { encoding: "utf8" },
    );
  };
  return {
    calls,
    runCommand,
    get packDirectory() {
      return packDirectory;
    },
  };
}

function composeFixture(kind, options = {}) {
  const root = temporaryRoot();
  const outputDirectory = join(root, "artifacts");
  const seedTarball = seedFixture(root, kind, options);
  const pluginDirectory = generatedPluginFixture(root, kind, options);
  const runner = fakeCommandRunner(options);
  return {
    root,
    outputDirectory,
    runner,
    input: {
      seedTarball,
      pluginDirectory,
      outputDirectory,
      tempRoot: root,
      env: { ...process.env, ...SECRET_ENVIRONMENT },
      runCommand: runner.runCommand,
    },
  };
}

describe("TC npm plugin composition", () => {
  it("keeps runtime identity and entrypoints while adding only safe generated metadata", () => {
    const fixture = composeFixture("memory");

    const result = composePluginTarball(fixture.input);

    assert.equal(result.kind, "memory");
    assert.equal(result.manifest.name, "@tc/moe-memory");
    assert.equal(result.manifest.version, VERSION);
    assert.equal(result.manifest.main, "dist/index.js");
    assert.equal(result.manifest.types, "dist/index.d.ts");
    assert.deepEqual(result.manifest.bin, { "moe-memory": "./dist/cli.js" });
    assert.deepEqual(result.manifest.dependencies, { zod: "^4.0.0" });
    assert.deepEqual(result.manifest.publishConfig, {
      registry: "https://proget.tcdevops.com/npm/tcnpm/",
    });
    assert.deepEqual(result.manifest.moeRelease, {
      upstreamVersion: "1.2.3",
      upstreamCommit: "a".repeat(40),
    });
    assert.deepEqual(result.manifest.keywords, ["runtime", "shared", "generated", "pi-package"]);
    assert.deepEqual(result.manifest.pi, {
      extensions: ["./.pi/extensions/moe-memory.ts"],
      skills: ["./skills"],
    });
    assert.equal(result.manifest.dependencies["generated-only"], undefined);
    assert.deepEqual(result.manifest.files, [...result.manifest.files].sort());
    for (const hidden of [
      ".agents",
      ".claude-plugin",
      ".codex-plugin",
      ".cursor-plugin",
      ".kimi-plugin",
      ".mcp.json",
      ".opencode",
      ".pi",
    ]) {
      assert.ok(result.manifest.files.includes(hidden), `missing files entry ${hidden}`);
    }
    assert.equal(result.files.includes(".moe-mint/manifest.json"), false);
  });

  it("inspects complete memory and glass payloads from their final tarballs", () => {
    for (const kind of ["memory", "glass"]) {
      const fixture = composeFixture(kind);
      const result = composePluginTarball(fixture.input);
      const payload = inspectPluginTarball(result.tarball, {
        runCommand: fixture.runner.runCommand,
      });

      assert.doesNotThrow(() => assertRequiredPluginPayload(payload, kind));
      for (const path of REQUIRED_PLUGIN_FILES[kind]) {
        assert.ok(payload.files.includes(path), `${kind} tarball is missing ${path}`);
      }
      for (const path of REQUIRED_EXECUTABLE_PLUGIN_FILES[kind]) {
        assert.equal(payload.modes[path], 0o755, `${kind} tarball changed mode on ${path}`);
      }
    }
  });

  it("uses pnpm with lifecycle scripts disabled and keeps hidden adapter directories", () => {
    const fixture = composeFixture("glass");
    const input = { ...fixture.input };
    delete input.runCommand;

    const result = composePluginTarball(input);

    assert.ok(existsSync(result.tarball));
    for (const path of [
      ".agents/plugins/marketplace.json",
      ".claude-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      ".opencode/plugins/moe-glass.js",
      ".pi/extensions/moe-glass.ts",
    ]) {
      assert.ok(result.files.includes(path), `pnpm pack dropped ${path}`);
    }
    assert.equal(result.modes["skills/browsing/chrome-ws"], 0o755);
  });

  it("composes byte-identical real memory and glass tarballs across wall-clock time", () => {
    const fixtures = ["memory", "glass"].map((kind) => composeFixture(kind));
    const first = fixtures.map((fixture) => {
      const input = { ...fixture.input, outputDirectory: join(fixture.root, "first") };
      delete input.runCommand;
      return composePluginTarball(input);
    });

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_500);

    const second = fixtures.map((fixture) => {
      const input = { ...fixture.input, outputDirectory: join(fixture.root, "second") };
      delete input.runCommand;
      return composePluginTarball(input);
    });
    for (let index = 0; index < fixtures.length; index++) {
      const firstBytes = readFileSync(first[index].tarball);
      const secondBytes = readFileSync(second[index].tarball);
      const firstIntegrity = createHash("sha512").update(firstBytes).digest("base64");
      const secondIntegrity = createHash("sha512").update(secondBytes).digest("base64");
      assert.equal(secondIntegrity, firstIntegrity, `${first[index].kind} integrity changed`);
      assert.deepEqual(secondBytes, firstBytes, `${first[index].kind} tar bytes changed`);
      for (const path of REQUIRED_EXECUTABLE_PLUGIN_FILES[first[index].kind]) {
        assert.equal(second[index].modes[path], 0o755, `${path} lost its executable mode`);
      }
    }
  });

  it("rejects a real tar header that lost a generated executable mode", () => {
    const executable = "hooks/moe-mint/run-hook.cmd";
    const fixture = composeFixture("memory");
    const result = composePluginTarball(fixture.input);
    const extracted = join(fixture.root, "tampered");
    mkdirSync(extracted);
    const unpacked = spawnSync("tar", ["-xzf", result.tarball, "-C", extracted], {
      encoding: "utf8",
    });
    assert.equal(unpacked.status, 0, unpacked.stderr);
    chmodSync(join(extracted, "package", executable), 0o644);
    const tamperedTarball = join(fixture.root, "tampered.tgz");
    const repacked = spawnSync("tar", ["-czf", tamperedTarball, "-C", extracted, "package"], {
      encoding: "utf8",
    });
    assert.equal(repacked.status, 0, repacked.stderr);
    const payload = inspectPluginTarball(tamperedTarball);
    assert.equal(payload.modes[executable], 0o644);

    assert.throws(
      () => assertRequiredPluginPayload(payload, "memory"),
      new RegExp(`memory plugin payload is not executable: ${executable.replaceAll(".", "\\.")}`),
    );
  });

  it("rejects memory without the bootstrap session-start command", () => {
    const fixture = composeFixture("memory", { bootstrap: false });

    assert.throws(
      () => composePluginTarball(fixture.input),
      /memory plugin payload has no bootstrap session-start command/,
    );
    assert.equal(
      fixture.runner.calls.some((call) => call.command === "pnpm"),
      false,
    );
  });

  it("rejects a seed whose runtime bin is absent", () => {
    const fixture = composeFixture("glass", { omitRuntimeBin: true });

    assert.throws(
      () => composePluginTarball(fixture.input),
      /runtime bin moe-glass is missing dist\/cli\.js/,
    );
    assert.equal(
      fixture.runner.calls.some((call) => call.command === "pnpm"),
      false,
    );
  });

  it("cleans its owned staging directory when repacking fails", () => {
    const fixture = composeFixture("glass", { failPack: true });

    assert.throws(() => composePluginTarball(fixture.input), /compose @tc\/moe-glass failed/);
    assert.ok(fixture.runner.packDirectory);
    assert.equal(existsSync(dirname(fixture.runner.packDirectory)), false);
  });
});
