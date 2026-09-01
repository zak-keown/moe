import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { MANIFEST_IDENTITIES, PRIVATE_FLIGHT_MANIFESTS } from "../check-downstream-scope.mjs";
import { EXPECTED_RELEASE_PACKAGES, packRelease } from "../tc-release-pack.mjs";
import { publishRelease } from "../tc-release-publish.mjs";
import { PROGET_REGISTRY } from "../tc-release-validate.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const VERSION = "1.2.3-tc.4";
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
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
    writeJson(
      join(root, path),
      packageManifest(name, PRIVATE_FLIGHT_MANIFESTS.includes(path) ? { private: true } : {}),
    );
  }
  return root;
}

function artifactName(name) {
  return `${name.slice(1).replaceAll("/", "-")}-${VERSION}.tgz`;
}

function fakePackRunner({ mutatePacked } = {}) {
  const manifests = new Map();
  const calls = [];
  const runCommand = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "pnpm") {
      assert.equal(options.env.PROGET_NPM_AUTH, undefined);
      const source = JSON.parse(readFileSync(join(options.cwd, "package.json"), "utf8"));
      const packed = structuredClone(source);
      mutatePacked?.(packed);
      const outputDirectory = args[args.indexOf("--pack-destination") + 1];
      const filename = artifactName(source.name);
      writeFileSync(join(outputDirectory, filename), "fake tarball");
      manifests.set(filename, packed);
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "tar") {
      const manifest = manifests.get(basename(args[1]));
      return { status: 0, stdout: JSON.stringify(manifest), stderr: "" };
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
    const manifest = packageManifest(expected.name);
    mutatePacked?.(manifest);
    writeFileSync(join(artifactsDir, filename), "fake tarball");
    manifests.set(filename, manifest);
  }
  return { artifactsDir, manifests };
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
    assert.equal(fake.calls.filter((call) => call.command === "pnpm").length, 8);
    assert.equal(fake.calls.filter((call) => call.command === "tar").length, 8);
    assert.deepEqual(
      result.artifacts.map((artifact) => artifact.manifest.name),
      EXPECTED_RELEASE_PACKAGES.map((pkg) => pkg.name),
    );
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

  it("rejects downstream identity and unresolved workspace ranges in packed manifests", () => {
    const root = releaseFixture();
    const fake = fakePackRunner({
      mutatePacked(manifest) {
        if (manifest.name === "@tc/moe-core") {
          manifest.dependencies = {
            "@bubstack/moe-memory": "workspace:*",
          };
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
    assert.equal(fake.calls.filter((call) => call.command === "pnpm").length, 8);
  });
});

describe("TC release publishing", () => {
  it("publishes next from a non-default branch with no latest promotion", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const calls = [];
    let npmrc;
    const runCommand = (command, args, options) => {
      calls.push({ command, args });
      if (command === "tar") {
        return {
          status: 0,
          stdout: JSON.stringify(manifests.get(basename(args[1]))),
          stderr: "",
        };
      }
      if (command === "npm") {
        assert.equal(calls.filter((call) => call.command === "tar").length, 8);
        assert.equal(options.env.PROGET_NPM_AUTH, undefined);
        assert.equal(args[0], "publish");
        assert.equal(args[args.indexOf("--tag") + 1], "next");
        npmrc = args[args.indexOf("--userconfig") + 1];
        assert.match(readFileSync(npmrc, "utf8"), /_auth=super-secret/);
        return { status: 0, stdout: "", stderr: "" };
      }
      throw new Error(`unexpected command ${command}`);
    };

    const result = publishRelease({
      root,
      artifactsDir,
      branch: "feature/release",
      defaultBranch: "main",
      mergeRequest: false,
      distTag: "next",
      auth: "super-secret",
      env: { ...process.env, PROGET_NPM_AUTH: "super-secret" },
      runCommand,
    });

    assert.equal(result.distTag, "next");
    assert.equal(calls.filter((call) => call.command === "npm").length, 8);
    assert.equal(
      calls.some((call) => call.command === "npm" && call.args[0] === "dist-tag"),
      false,
    );
    assert.equal(existsSync(npmrc), false);
  });

  it("uploads the full candidate train before promoting latest with the umbrella last", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const npmCalls = [];
    const runCommand = (command, args) => {
      if (command === "tar") {
        return {
          status: 0,
          stdout: JSON.stringify(manifests.get(basename(args[1]))),
          stderr: "",
        };
      }
      npmCalls.push(args);
      return { status: 0, stdout: "", stderr: "" };
    };

    const result = publishRelease({
      root,
      artifactsDir,
      branch: "main",
      defaultBranch: "main",
      distTag: "latest",
      auth: "secret",
      env: process.env,
      runCommand,
    });

    const publishes = npmCalls.filter((args) => args[0] === "publish");
    const promotions = npmCalls.filter((args) => args[0] === "dist-tag");
    assert.equal(publishes.length, 8);
    assert.equal(promotions.length, 8);
    assert.deepEqual(npmCalls.slice(0, 8), publishes);
    assert.equal(
      publishes.some((args) => args[args.indexOf("--tag") + 1] === "latest"),
      false,
    );
    assert.ok(
      publishes.every((args) => args[args.indexOf("--tag") + 1] === "tc-candidate-1-2-3-tc-4"),
    );
    assert.equal(promotions.at(-1)[2], `@tc/moe@${VERSION}`);
    assert.equal(promotions.at(-1)[3], "latest");
    assert.equal(result.uploadTag, "tc-candidate-1-2-3-tc-4");
  });

  it("performs no latest promotion when any candidate upload fails", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root);
    const npmCalls = [];
    const runCommand = (command, args) => {
      if (command === "tar") {
        return {
          status: 0,
          stdout: JSON.stringify(manifests.get(basename(args[1]))),
          stderr: "",
        };
      }
      npmCalls.push(args);
      return { status: npmCalls.length === 5 ? 1 : 0, stdout: "", stderr: "" };
    };

    assert.throws(
      () =>
        publishRelease({
          root,
          artifactsDir,
          branch: "main",
          defaultBranch: "main",
          distTag: "latest",
          auth: "secret",
          env: process.env,
          runCommand,
        }),
      /publish .* failed/,
    );
    assert.equal(npmCalls.length, 5);
    assert.equal(
      npmCalls.some((args) => args[0] === "dist-tag"),
      false,
    );
  });

  it("fails before the first publish when a later tarball is invalid", () => {
    const root = releaseFixture();
    const { artifactsDir, manifests } = makePackedArtifacts(root, (manifest) => {
      if (manifest.name === "@tc/moe-tab") manifest.dependencies = { bad: "workspace:*" };
    });
    const calls = [];
    const runCommand = (command, args) => {
      calls.push(command);
      if (command === "tar") {
        return {
          status: 0,
          stdout: JSON.stringify(manifests.get(basename(args[1]))),
          stderr: "",
        };
      }
      return { status: 0, stdout: "", stderr: "" };
    };

    assert.throws(
      () =>
        publishRelease({
          root,
          artifactsDir,
          branch: "main",
          defaultBranch: "main",
          distTag: "latest",
          auth: "secret",
          env: process.env,
          runCommand,
        }),
      /retains workspace:/,
    );
    assert.equal(calls.includes("npm"), false);
  });

  it("fails closed rather than letting a branch move latest", () => {
    const root = releaseFixture();
    const { artifactsDir } = makePackedArtifacts(root);
    let commands = 0;

    assert.throws(
      () =>
        publishRelease({
          root,
          artifactsDir,
          branch: "feature/release",
          defaultBranch: "main",
          distTag: "latest",
          auth: "secret",
          env: process.env,
          runCommand() {
            commands++;
            return { status: 0, stdout: "", stderr: "" };
          },
        }),
      /release validation failed/,
    );
    assert.equal(commands, 0);
  });

  it("rejects credential line injection before creating an npm process", () => {
    const root = releaseFixture();
    const { artifactsDir } = makePackedArtifacts(root);
    let commands = 0;

    assert.throws(
      () =>
        publishRelease({
          root,
          artifactsDir,
          branch: "main",
          defaultBranch: "main",
          distTag: "latest",
          auth: "secret\nalways-auth=false",
          env: process.env,
          runCommand() {
            commands++;
            return { status: 0, stdout: "", stderr: "" };
          },
        }),
      /invalid line break/,
    );
    assert.equal(commands, 0);
  });
});
