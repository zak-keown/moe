import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PROGET_REGISTRY, validateRelease } from "../tc-release-validate.mjs";

const SCRIPT = fileURLToPath(new URL("../tc-release-validate.mjs", import.meta.url));
const roots = [];
const SHA = "0123456789abcdef0123456789abcdef01234567";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function manifest(name, extras = {}) {
  return {
    name,
    version: "1.2.3-tc.4",
    type: "module",
    moeRelease: { upstreamVersion: "1.2.3", upstreamCommit: SHA },
    publishConfig: { registry: PROGET_REGISTRY },
    ...extras,
  };
}

function fixture({ rootManifest, packages = [], release = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "moe-tc-release-"));
  roots.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
  writeJson(join(root, "package.json"), rootManifest ?? manifest("@tc/moe"));
  if (release) {
    writeJson(join(root, "tc-release.json"), {
      upstreamVersion: "1.2.3",
      upstreamCommit: SHA,
      tcRelease: 4,
    });
  }
  for (const [directory, value] of packages) {
    const packageRoot = join(root, "packages", directory);
    mkdirSync(packageRoot, { recursive: true });
    writeJson(join(packageRoot, "package.json"), value);
  }
  return root;
}

function validate(root, overrides = {}) {
  return validateRelease({
    root,
    branch: "main",
    defaultBranch: "main",
    distTag: "latest",
    authPresent: true,
    ...overrides,
  });
}

function codes(result) {
  return result.problems.map((problem) => problem.code);
}

describe("TC release policy", () => {
  it("accepts one canonical lockstep train for the default branch", () => {
    const root = fixture({
      rootManifest: manifest("@tc/moe", {
        dependencies: { "@tc/moe-memory": "workspace:*" },
      }),
      packages: [["memory", manifest("@tc/moe-memory")]],
    });

    const result = validate(root);

    assert.equal(result.ok, true);
    assert.equal(result.release.version, "1.2.3-tc.4");
    assert.equal(result.ci.expectedTag, "latest");
    assert.deepEqual(
      result.packages.map((pkg) => pkg.name),
      ["@tc/moe", "@tc/moe-memory"],
    );
  });

  it("requires next for branch and merge-request releases", () => {
    const root = fixture();

    assert.equal(validate(root, { branch: "feature/x", distTag: "next" }).ok, true);
    assert.equal(validate(root, { branch: "main", mergeRequest: true, distTag: "next" }).ok, true);
    assert.ok(
      codes(validate(root, { branch: "feature/x", distTag: "latest" })).includes("ci.dist-tag"),
    );
    assert.ok(codes(validate(root, { branch: "main", distTag: "next" })).includes("ci.dist-tag"));
  });

  it("rejects version, metadata, registry, and downstream identity drift", () => {
    const root = fixture({
      rootManifest: manifest("@bubstack/moe", {
        version: "1.2.3-tc.3",
        moeRelease: { upstreamVersion: "1.2.2", upstreamCommit: "f".repeat(40) },
        publishConfig: { registry: "https://registry.npmjs.org/", tag: "latest" },
        dependencies: { "@bubstack/moe-memory": "workspace:*" },
      }),
    });

    const result = validate(root);

    assert.equal(result.ok, false);
    const actualCodes = codes(result);
    for (const code of [
      "package.umbrella",
      "package.scope",
      "package.version",
      "package.upstream-version",
      "package.upstream-commit",
      "package.registry",
      "package.static-dist-tag",
      "package.bubstack-leak",
    ]) {
      assert.ok(actualCodes.includes(code), `missing ${code}`);
    }
  });

  it("treats tc-release.json as strict canonical input", () => {
    const missing = fixture({ release: false });
    assert.ok(codes(validate(missing)).includes("release-file.missing"));

    const invalid = fixture();
    writeJson(join(invalid, "tc-release.json"), {
      upstreamVersion: "1.2.3-rc.1",
      upstreamCommit: "short",
      tcRelease: 0,
      version: "independently-authored",
    });
    const actualCodes = codes(validate(invalid));
    for (const code of [
      "release-file.unknown-key",
      "release-file.upstream-version",
      "release-file.upstream-commit",
      "release-file.tc-release",
    ]) {
      assert.ok(actualCodes.includes(code), `missing ${code}`);
    }
  });

  it("rejects a published package depending on a private workspace package", () => {
    const root = fixture({
      rootManifest: manifest("@tc/moe", {
        dependencies: { "@tc/moe-core": "workspace:*" },
      }),
      packages: [["core", manifest("@tc/moe-core", { private: true })]],
    });

    assert.ok(codes(validate(root)).includes("package.private-internal-dependency"));
  });

  it("requires an exact or workspace-star internal release version", () => {
    const root = fixture({
      rootManifest: manifest("@tc/moe", {
        dependencies: { "@tc/moe-memory": "workspace:^" },
      }),
      packages: [["memory", manifest("@tc/moe-memory")]],
    });

    assert.ok(codes(validate(root)).includes("package.internal-version"));
  });

  it("fails closed when CI context or protected ProGet auth is absent", () => {
    const root = fixture();
    const result = validateRelease({ root });

    const actualCodes = codes(result);
    for (const code of ["ci.branch", "ci.default-branch", "ci.dist-tag", "ci.proget-auth"]) {
      assert.ok(actualCodes.includes(code), `missing ${code}`);
    }
    assert.deepEqual(result.authentication, { variable: "PROGET_NPM_AUTH", present: false });
  });

  it("CLI JSON mode is read-only and never exposes the credential", () => {
    const root = fixture();
    const before = readFileSync(join(root, "package.json"), "utf8");

    const run = spawnSync(
      process.execPath,
      [
        SCRIPT,
        "--root",
        root,
        "--branch",
        "main",
        "--default-branch",
        "main",
        "--dist-tag",
        "latest",
        "--json",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PROGET_NPM_AUTH: "do-not-print-this" },
      },
    );

    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).ok, true);
    assert.equal(run.stdout.includes("do-not-print-this"), false);
    assert.equal(readFileSync(join(root, "package.json"), "utf8"), before);
  });
});
