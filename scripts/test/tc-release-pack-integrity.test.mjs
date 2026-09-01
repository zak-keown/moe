import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { assertPackedEntrypoints, listPackedFiles } from "../tc-release-pack.mjs";

const CI_CONFIG = fileURLToPath(new URL("../../.gitlab-ci.yml", import.meta.url));

describe("packed npm entrypoint integrity", () => {
  it("accepts content-only packages and verifies all supported entrypoint shapes", () => {
    assert.doesNotThrow(() => assertPackedEntrypoints({ name: "content-only" }, ["README.md"]));

    const manifest = {
      main: "dist/index.js",
      types: "./dist/index.d.ts",
      bin: { tool: "./bin/tool.js" },
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
          fallback: ["./dist/fallback.js", null],
        },
        "./package.json": "./package.json",
      },
    };
    assert.doesNotThrow(() =>
      assertPackedEntrypoints(manifest, [
        "bin/tool.js",
        "dist/fallback.js",
        "dist/index.d.ts",
        "dist/index.js",
        "package.json",
      ]),
    );
  });

  it("rejects the clean-checkout failure mode when runtime dist was never built", () => {
    assert.throws(
      () =>
        assertPackedEntrypoints(
          { main: "dist/index.js", bin: { tool: "./dist/cli.js" } },
          ["package.json", "README.md"],
          "fake runtime tarball",
        ),
      /fake runtime tarball package\.json\.main points to missing package file "dist\/index\.js"/,
    );
  });

  it("fails closed on traversal, absolute, URL, wildcard, and malformed targets", () => {
    for (const target of [
      "../escape.js",
      "dist/../escape.js",
      "/absolute.js",
      "file:///tmp/escape.js",
      "dist\\index.js",
      "./dist/*.js",
      "dist//index.js",
    ]) {
      assert.throws(
        () => assertPackedEntrypoints({ main: target }, ["escape.js", "dist/index.js"]),
        /not a valid relative package file/,
        target,
      );
    }
    assert.throws(
      () => assertPackedEntrypoints({ exports: { ".": true } }, []),
      /must contain only relative file targets/,
    );
    assert.throws(
      () => assertPackedEntrypoints({ exports: "dist/index.js" }, ["dist/index.js"]),
      /exports targets must start with \./,
    );
  });

  it("lists tar entries without credentials and rejects archive traversal", () => {
    const credentialNames = [
      "PROGET_NPM_AUTH",
      "NPM_TOKEN",
      "NODE_AUTH_TOKEN",
      "npm_config_authToken",
      "NPM_CONFIG_USERCONFIG",
    ];
    const runCommand = (_command, _args, options) => {
      for (const name of credentialNames) assert.equal(options.env[name], undefined);
      assert.equal(options.env.SAFE_VALUE, "kept");
      return {
        status: 0,
        stdout: "package/package.json\npackage/dist/index.js\npackage/dist/\n",
        stderr: "",
      };
    };
    const env = Object.fromEntries(credentialNames.map((name) => [name, "secret"]));
    env.SAFE_VALUE = "kept";

    assert.deepEqual(listPackedFiles("fake.tgz", runCommand, env), [
      "dist/index.js",
      "package.json",
    ]);
    assert.throws(
      () =>
        listPackedFiles(
          "traversal.tgz",
          () => ({ status: 0, stdout: "package/package.json\npackage/../escape\n", stderr: "" }),
          {},
        ),
      /path traversal/,
    );
    assert.throws(
      () =>
        listPackedFiles(
          "dot-segment.tgz",
          () => ({
            status: 0,
            stdout: "package/package.json\npackage/./dist/index.js\n",
            stderr: "",
          }),
          {},
        ),
      /dot segments/,
    );
  });
});

describe("TC release clean-job CI policy", () => {
  function config() {
    return parse(readFileSync(CI_CONFIG, "utf8"));
  }

  it("routes every current Docker job to TC's docker-image runners", () => {
    assert.deepEqual(config().default.tags, ["docker-image"]);
  });

  it("scrubs registry credentials before any pnpm bootstrap or install command", () => {
    const setup = config()[".pnpm"].before_script;
    assert.match(setup[0], /unset PROGET_NPM_AUTH NPM_TOKEN NODE_AUTH_TOKEN/);
    assert.match(setup[0], /npm_config_\*auth\*/);
    assert.match(setup[0], /npm_config_\*token\*/);
    assert.match(setup[0], /npm_config_\*userconfig\*/);
    assert.equal(setup[1], "corepack enable");
    assert.equal(setup.at(-1), "pnpm install --frozen-lockfile");
  });

  it("builds runtime outputs in the pack job filesystem immediately before packing", () => {
    const pack = config()["tc-release-pack"];
    assert.deepEqual(pack.script, [
      "pnpm build",
      "node scripts/tc-release-pack.mjs --output-dir .tc-release",
    ]);
    assert.ok(pack.needs.includes("build"));
    assert.equal(JSON.stringify(pack.variables ?? {}).includes("PROGET_NPM_AUTH"), false);
  });
});
