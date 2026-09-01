import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  assertRequiredPluginPayload,
  composePluginTarball,
  inspectPluginTarball,
  REQUIRED_PLUGIN_FILES,
} from "../tc-release-compose.mjs";

const VERSION = "1.2.3-tc.4";
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
    if (command === "tar") return spawnSync(command, args, { encoding: "utf8", ...options });
    assert.equal(command, "pnpm");
    packDirectory = options.cwd;
    assert.deepEqual(args.slice(0, 2), ["--config.ignore-scripts=true", "pack"]);
    assert.equal(options.env.npm_config_ignore_scripts, "true");
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
      env: { ...process.env, PROGET_NPM_AUTH: "never-pass-this-to-a-child" },
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
