import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { assertPackedEntrypoints, listPackedFiles } from "../tc-release-pack.mjs";

const CI_CONFIG = fileURLToPath(new URL("../../.gitlab-ci.yml", import.meta.url));
const CI_SAFE_ENV = fileURLToPath(new URL("../ci-safe-env", import.meta.url));

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
      "CI_JOB_TOKEN",
      "TC_GITLAB_TOKEN",
      "DATABASE_PASSWORD",
      "SIGNING_PRIVATE_KEY",
      "SSH_AUTH_SOCK",
      "AWS_SECRET_ACCESS_KEY",
      "FUTURE_SERVICE_SESSION",
    ];
    const runCommand = (_command, _args, options) => {
      for (const name of credentialNames) assert.equal(options.env[name], undefined);
      assert.equal(options.env.SAFE_VALUE, undefined);
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

  it("runs every pnpm bootstrap and install command through the safe allowlist", () => {
    const setup = config()[".pnpm"].before_script;
    assert.deepEqual(setup, [
      "sh scripts/ci-safe-env safe corepack enable",
      "sh scripts/ci-safe-env safe pnpm config set store-dir .pnpm-store",
      "sh scripts/ci-safe-env safe pnpm install --frozen-lockfile",
    ]);
  });

  it("builds runtime outputs in the pack job filesystem immediately before packing", () => {
    const pack = config()["tc-release-pack"];
    assert.deepEqual(pack.script, [
      "sh scripts/ci-safe-env safe node scripts/tab-third-party-licenses.mjs --check-inputs",
      "sh scripts/ci-safe-env safe pnpm build",
      "sh scripts/ci-safe-env safe node scripts/tc-release-pack.mjs --output-dir .tc-release --tab-native-dir .tc-tab-native",
    ]);
    assert.ok(pack.needs.includes("build"));
    assert.deepEqual(pack.needs.at(-1), { job: "tab-native-linux", artifacts: true });
    assert.equal(JSON.stringify(pack.variables ?? {}).includes("PROGET_NPM_AUTH"), false);
  });

  it("builds and executes both Linux architectures through the Rust allowlist", () => {
    const job = config()["tab-native-linux"];
    assert.equal(job.image, "rust:1.98.0-bullseye");
    assert.ok(
      job.before_script.every((command) => command.startsWith("sh scripts/ci-safe-env rust ")),
    );
    assert.match(job.before_script.join("\n"), /gcc-aarch64-linux-gnu/);
    assert.match(job.before_script.join("\n"), /libc6-dev-arm64-cross/);
    assert.match(job.before_script.join("\n"), /\bnodejs\b/);
    assert.match(job.before_script.join("\n"), /qemu-user/);
    assert.deepEqual(job.script.slice(0, 2), [
      "sh scripts/ci-safe-env rust cargo fetch --locked --manifest-path packages/tab/Cargo.toml",
      "sh scripts/ci-safe-env rust env CARGO_NET_OFFLINE=true node scripts/tab-third-party-licenses.mjs --check",
    ]);
    assert.match(job.script.join("\n"), /build-tab-native-linux\.sh/);
    assert.deepEqual(job.artifacts.paths, [".tc-tab-native/linux-*/*.so"]);
    assert.equal(JSON.stringify(job).includes("apple-darwin"), false);
  });

  it("reconstructs exact runtime environments for all four CI modes", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "moe-ci-safe-env-"));
    const jobId = `${Date.now()}${process.pid}`;
    const safeRoot = join("/tmp", `moe-ci-safe-env-${jobId}`);
    try {
      const ambient = {
        PATH: process.env.PATH,
        CI: "true",
        GITLAB_CI: "true",
        CI_JOB_ID: jobId,
        CI_PROJECT_DIR: projectDirectory,
        CI_COMMIT_BRANCH: "feature/security",
        CI_DEFAULT_BRANCH: "main",
        CI_MERGE_REQUEST_IID: "42",
        CI_COMMIT_REF_PROTECTED: "false",
        CI_PIPELINE_SOURCE: "merge_request_event",
        CI_COMMIT_SHA: "a".repeat(40),
        CI_COMMIT_SHORT_SHA: "aaaaaaaa",
        CI_COMMIT_TAG: "",
        NPM_DIST_TAG: "next",
        PNPM_HOME: "/usr/local/bin",
        TURBO_TELEMETRY_DISABLED: "1",
        LANG: "C.UTF-8",
        PROGET_NPM_AUTH: "proget-secret",
        TC_GITLAB_TOKEN: "drift-secret",
        CI_JOB_TOKEN: "job-secret",
        NPM_TOKEN: "npm-secret",
        NODE_AUTH_TOKEN: "node-secret",
        DATABASE_PASSWORD: "database-secret",
        SIGNING_PRIVATE_KEY: "private-key",
        SSH_AUTH_SOCK: "/tmp/agent.sock",
        AWS_ACCESS_KEY_ID: "access-key",
        AWS_SECRET_ACCESS_KEY: "cloud-secret",
        GOOGLE_APPLICATION_CREDENTIALS: "/tmp/google.json",
        FUTURE_SERVICE_SESSION: "novel-secret",
        SAFE_MARKER: "unknown-is-not-safe",
      };

      const baseKeys = new Set([
        "PATH",
        "HOME",
        "COREPACK_HOME",
        "XDG_CACHE_HOME",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "NPM_CONFIG_CACHE",
        "PIP_CACHE_DIR",
        "UV_CACHE_DIR",
        "PNPM_HOME",
        "TURBO_TELEMETRY_DISABLED",
        "CI",
        "GITLAB_CI",
        "CI_PROJECT_DIR",
        "CI_COMMIT_BRANCH",
        "CI_DEFAULT_BRANCH",
        "CI_MERGE_REQUEST_IID",
        "CI_COMMIT_REF_PROTECTED",
        "CI_PIPELINE_SOURCE",
        "CI_COMMIT_SHA",
        "CI_COMMIT_SHORT_SHA",
        "CI_COMMIT_TAG",
        "NPM_DIST_TAG",
        "LANG",
        "LANGUAGE",
        "LC_ADDRESS",
        "LC_ALL",
        "LC_COLLATE",
        "LC_CTYPE",
        "LC_IDENTIFICATION",
        "LC_MEASUREMENT",
        "LC_MESSAGES",
        "LC_MONETARY",
        "LC_NAME",
        "LC_NUMERIC",
        "LC_PAPER",
        "LC_TELEPHONE",
        "LC_TIME",
        "TZ",
        "TEMP",
        "TMP",
        "TMPDIR",
      ]);

      const invoke = (mode) => {
        const result = spawnSync("sh", [CI_SAFE_ENV, mode, "/usr/bin/env"], {
          encoding: "utf8",
          env: ambient,
        });
        assert.equal(result.status, 0, `${mode}: ${result.stderr}`);
        return Object.fromEntries(
          result.stdout
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const separator = line.indexOf("=");
              return [line.slice(0, separator), line.slice(separator + 1)];
            }),
        );
      };

      for (const [mode, additions] of [
        ["safe", {}],
        ["rust", { CARGO_HOME: "/usr/local/cargo", RUSTUP_HOME: "/usr/local/rustup" }],
        ["publish", { PROGET_NPM_AUTH: "proget-secret" }],
        ["drift", { TC_GITLAB_TOKEN: "drift-secret" }],
      ]) {
        const visible = invoke(mode);
        assert.deepEqual(
          new Set(Object.keys(visible)),
          new Set([...baseKeys, ...Object.keys(additions)]),
        );
        for (const [name, value] of Object.entries(additions)) assert.equal(visible[name], value);
        assert.equal(visible.HOME, join(safeRoot, "home"));
        assert.equal(visible.COREPACK_HOME, join(safeRoot, "corepack"));
        assert.equal(visible.XDG_CACHE_HOME, join(safeRoot, "xdg-cache"));
        assert.equal(visible.XDG_CONFIG_HOME, join(safeRoot, "xdg-config"));
        assert.equal(visible.XDG_DATA_HOME, join(safeRoot, "xdg-data"));
        assert.equal(visible.NPM_CONFIG_CACHE, join(safeRoot, "npm-cache"));
        assert.equal(visible.PIP_CACHE_DIR, join(safeRoot, "pip-cache"));
        assert.equal(visible.UV_CACHE_DIR, join(safeRoot, "uv-cache"));
        for (const generatedPath of [
          visible.HOME,
          visible.COREPACK_HOME,
          visible.XDG_CACHE_HOME,
          visible.XDG_CONFIG_HOME,
          visible.XDG_DATA_HOME,
          visible.NPM_CONFIG_CACHE,
          visible.PIP_CACHE_DIR,
          visible.UV_CACHE_DIR,
        ]) {
          assert.equal(
            generatedPath.startsWith(`${projectDirectory}/`),
            false,
            `${mode} generated a safe directory inside CI_PROJECT_DIR: ${generatedPath}`,
          );
        }
        for (const secretName of [
          "FUTURE_SERVICE_SESSION",
          "DATABASE_PASSWORD",
          "SIGNING_PRIVATE_KEY",
          "AWS_SECRET_ACCESS_KEY",
        ]) {
          assert.equal(
            visible[secretName],
            undefined,
            `${mode} exposed novel secret ${secretName}`,
          );
        }
        assert.equal(visible.TEMP, "/tmp");
        assert.equal(visible.TMP, "/tmp");
        assert.equal(visible.TMPDIR, "/tmp");
        for (const certName of [
          "SSL_CERT_DIR",
          "SSL_CERT_FILE",
          "NODE_EXTRA_CA_CERTS",
          "REQUESTS_CA_BUNDLE",
          "CURL_CA_BUNDLE",
          "GIT_SSL_CAINFO",
          "NPM_CONFIG_CAFILE",
        ]) {
          assert.equal(
            Object.hasOwn(visible, certName),
            false,
            `${mode} exported absent ${certName}`,
          );
        }
      }

      const trusted = spawnSync("sh", [CI_SAFE_ENV, "safe", "/usr/bin/env"], {
        encoding: "utf8",
        env: {
          ...ambient,
          SSL_CERT_FILE: "/etc/tc/ca.pem",
          NODE_EXTRA_CA_CERTS: "/etc/tc/node-ca.pem",
        },
      });
      assert.equal(trusted.status, 0, trusted.stderr);
      assert.match(trusted.stdout, /^SSL_CERT_FILE=\/etc\/tc\/ca\.pem$/m);
      assert.match(trusted.stdout, /^NODE_EXTRA_CA_CERTS=\/etc\/tc\/node-ca\.pem$/m);
      assert.doesNotMatch(trusted.stdout, /CI_JOB_TOKEN|SAFE_MARKER|FUTURE_SERVICE_SESSION/);
      assert.deepEqual(readdirSync(projectDirectory), []);

      const rejectedJobId = spawnSync("sh", [CI_SAFE_ENV, "safe", "/usr/bin/env"], {
        encoding: "utf8",
        env: { ...ambient, CI_JOB_ID: "123/../../checkout" },
      });
      assert.equal(rejectedJobId.status, 64);
      assert.match(rejectedJobId.stderr, /CI_JOB_ID must contain only decimal digits/);
    } finally {
      rmSync(projectDirectory, { recursive: true, force: true });
      rmSync(safeRoot, { recursive: true, force: true });
    }
  });

  it("executes the tab native version jq expression with its YAML quoting intact", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "moe-ci-tab-version-"));
    try {
      const binDirectory = join(projectDirectory, "bin");
      const jqPath = join(binDirectory, "jq");
      mkdirSync(binDirectory);
      writeFileSync(
        jqPath,
        '#!/bin/sh\nprintf "%s\\n" "$@" > "$CI_PROJECT_DIR/jq-args"\nprintf "0.0.0-tc.1\\n"\n',
      );
      chmodSync(jqPath, 0o755);

      const nativeCommand = config()["tab-native-linux"].script[2];
      const probe = nativeCommand.replace(
        'TAB_NATIVE_OUTPUT_DIR="$CI_PROJECT_DIR/.tc-tab-native" scripts/build-tab-native-linux.sh',
        'printf "TAB_RELEASE_VERSION=%s\\n" "$TAB_RELEASE_VERSION"',
      );
      assert.notEqual(probe, nativeCommand, "native command probe replacement did not match");
      const result = spawnSync("sh", ["-c", probe], {
        cwd: dirname(CI_CONFIG),
        encoding: "utf8",
        env: {
          PATH: `${binDirectory}:${process.env.PATH}`,
          CI_PROJECT_DIR: projectDirectory,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /TAB_RELEASE_VERSION=0\.0\.0-tc\.1/);
      assert.deepEqual(
        readFileSync(join(projectDirectory, "jq-args"), "utf8").split("\n").filter(Boolean),
        ["-r", '.upstreamVersion + "-tc." + (.tcRelease | tostring)', "tc-release.json"],
      );
    } finally {
      rmSync(projectDirectory, { recursive: true, force: true });
    }
  });
});
