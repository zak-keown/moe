import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { PROGET_REGISTRY, validateRelease } from "../tc-release-validate.mjs";

const SCRIPT = fileURLToPath(new URL("../tc-release-validate.mjs", import.meta.url));
const CI_CONFIG = fileURLToPath(new URL("../../.gitlab-ci.yml", import.meta.url));
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

  it("performs structural validation without ProGet authentication", () => {
    const root = fixture();

    const result = validate(root, { authPresent: false });

    assert.equal(result.ok, true);
    assert.equal(Object.hasOwn(result, "authentication"), false);
    assert.equal(codes(result).includes("ci.proget-auth"), false);
  });

  it("fails closed when required CI context is absent", () => {
    const root = fixture();
    const result = validateRelease({ root });

    const actualCodes = codes(result);
    for (const code of ["ci.branch", "ci.default-branch", "ci.dist-tag"]) {
      assert.ok(actualCodes.includes(code), `missing ${code}`);
    }
    assert.equal(actualCodes.includes("ci.proget-auth"), false);
  });

  it("CLI JSON mode is read-only and succeeds without a credential", () => {
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
        env: { ...process.env, PROGET_NPM_AUTH: "" },
      },
    );

    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).ok, true);
    assert.equal(readFileSync(join(root, "package.json"), "utf8"), before);
  });
});

describe("TC release GitLab policy", () => {
  const prerequisiteNeeds = [
    "install",
    "lint",
    "typecheck",
    "test",
    "build",
    "plugins",
    "provenance",
    "tc-drift-manifest",
  ];

  function config() {
    return parse(readFileSync(CI_CONFIG, "utf8"));
  }

  it("keeps merge requests and feature pushes as next-tag pack-only dry runs", () => {
    const ci = config();
    const pack = ci["tc-release-pack"];
    const native = ci["tab-native-linux"];

    assert.deepEqual(pack.needs, [
      ...prerequisiteNeeds,
      { job: "tab-native-linux", artifacts: true },
    ]);
    const mergeRequestRule = pack.rules.find((rule) => rule.if?.includes("merge_request_event"));
    const featurePushRule = pack.rules.find(
      (rule) =>
        rule.variables?.NPM_DIST_TAG === "next" && rule.if?.includes("!= $CI_DEFAULT_BRANCH"),
    );
    assert.equal(mergeRequestRule.variables.NPM_DIST_TAG, "next");
    assert.match(featurePushRule.if, /CI_PIPELINE_SOURCE == "push"/);
    assert.match(featurePushRule.if, /CI_COMMIT_BRANCH/);
    assert.match(featurePushRule.if, /CI_COMMIT_BRANCH != \$CI_DEFAULT_BRANCH/);
    assert.deepEqual(pack.rules.at(-1), { when: "never" });
    assert.equal(JSON.stringify(pack.variables ?? {}).includes("PROGET_NPM_AUTH"), false);

    assert.ok(native.rules.some((rule) => rule.if?.includes("!= $CI_DEFAULT_BRANCH")));
    assert.deepEqual(native.rules.at(-1), { when: "never" });
  });

  it("skips release work on ordinary default-branch pushes", () => {
    const ci = config();
    for (const name of ["tab-native-linux", "tc-release-pack"]) {
      const job = ci[name];
      const releaseRule = job.rules.find((rule) => rule.changes?.includes("tc-release.json"));
      assert.match(releaseRule.if, /CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH/);
      assert.deepEqual(releaseRule.changes, ["tc-release.json"]);
      assert.ok(job.rules.some((rule) => rule.if?.includes("!= $CI_DEFAULT_BRANCH")));
      assert.deepEqual(job.rules.at(-1), { when: "never" });
    }
  });

  it("permits latest publication only for protected default-branch release changes or forced retries", () => {
    const ci = config();
    const packReleaseRule = ci["tc-release-pack"].rules.find(
      (rule) => rule.variables?.NPM_DIST_TAG === "latest" && rule.changes,
    );
    const publish = ci["tc-release-publish"];
    const publishRule = publish.rules.find(
      (rule) => rule.variables?.NPM_DIST_TAG === "latest" && rule.changes,
    );

    for (const rule of [packReleaseRule, publishRule]) {
      assert.match(rule.if, /CI_PIPELINE_SOURCE == "push"/);
      assert.match(rule.if, /CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH/);
      assert.match(rule.if, /CI_COMMIT_REF_PROTECTED == "true"/);
      assert.deepEqual(rule.changes, ["tc-release.json"]);
      assert.equal(rule.variables.NPM_DIST_TAG, "latest");
    }

    for (const name of ["tab-native-linux", "tc-release-pack", "tc-release-publish"]) {
      const forceRule = ci[name].rules.find((rule) => rule.if?.includes("TC_RELEASE_FORCE"));
      assert.match(forceRule.if, /CI_PIPELINE_SOURCE == "push"/);
      assert.match(forceRule.if, /CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH/);
      assert.match(forceRule.if, /CI_COMMIT_REF_PROTECTED == "true"/);
      assert.match(forceRule.if, /TC_RELEASE_FORCE == "1"/);
      assert.equal(forceRule.changes, undefined);
      if (name !== "tab-native-linux") {
        assert.equal(forceRule.variables.NPM_DIST_TAG, "latest");
      }
    }

    assert.equal(publish.environment, "proget-publish");
    assert.equal(publish.resource_group, "tc-npm-release");
    assert.equal(publish.interruptible, false);
    assert.deepEqual(publish.needs, [...prerequisiteNeeds, "tc-release-pack"]);
    assert.deepEqual(publish.rules.at(-1), { when: "never" });
    assert.equal(publish.rules.length, 4);
    assert.equal(JSON.stringify(publish).includes("next"), false);
  });
});
