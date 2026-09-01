import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { assertDirectLegalPayload, stageDirectNpmTarball } from "../tc-release-legal.mjs";
import { assertPackedTabLegalPayload } from "../tc-release-pack.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "moe-release-legal-test-"));
  roots.push(root);
  write(join(root, "LICENSE"), "canonical apache\n");
  write(join(root, "LICENSE-MIT"), "canonical mit\n");
  write(join(root, "NOTICE"), "canonical notice\n");
  write(
    join(root, "packages/tab/native-release/THIRD_PARTY_LICENSES.txt"),
    "canonical third party\n",
  );
  return root;
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function archiveFiles(tarball) {
  return run("tar", ["-tzf", tarball])
    .stdout.split(/\r?\n/u)
    .filter((path) => path.startsWith("package/") && !path.endsWith("/"))
    .map((path) => path.slice("package/".length))
    .sort();
}

function archiveBytes(tarball, path) {
  return run("tar", ["-xOf", tarball, `package/${path}`], { encoding: null }).stdout;
}

function makeSeed(root, name, license) {
  const source = join(root, `source-${name.slice(1).replaceAll("/", "-")}`);
  const seeds = join(root, "seeds");
  mkdirSync(seeds, { recursive: true });
  write(
    join(source, "package.json"),
    `${JSON.stringify(
      {
        name,
        version: "1.0.0",
        license,
        ...(license === "MIT" ? { files: ["index.js"] } : {}),
      },
      null,
      2,
    )}\n`,
  );
  write(join(source, "index.js"), "export {};\n");
  write(join(source, "LICENSE"), "wrong inherited terms\n");
  write(join(source, "LICENSE-old"), "stale extra terms\n");
  write(join(source, "NOTICE"), "stale notice\n");
  const before = new Set(readdirSync(seeds));
  run("pnpm", ["--config.ignore-scripts=true", "pack", "--pack-destination", seeds], {
    cwd: source,
  });
  const seed = readdirSync(seeds).find((path) => !before.has(path));
  assert.ok(seed);
  return join(seeds, seed);
}

describe("direct npm legal staging", () => {
  it("replaces inherited legal files with exact canonical bytes in real tarballs", () => {
    const root = fixtureRoot();
    const cases = [
      {
        name: "@tc/apache",
        license: "Apache-2.0",
        expected: { LICENSE: "canonical apache\n", NOTICE: "canonical notice\n" },
      },
      {
        name: "@tc/mit",
        license: "MIT",
        expected: { LICENSE: "canonical mit\n" },
      },
      {
        name: "@tc/mixed",
        license: "MIT AND Apache-2.0",
        expected: {
          LICENSE: "canonical apache\n",
          "LICENSE-MIT": "canonical mit\n",
          NOTICE: "canonical notice\n",
        },
      },
    ];

    for (const testCase of cases) {
      const output = join(root, `output-${testCase.name.slice(4)}`);
      const temporaryRoot = join(root, `temporary-${testCase.name.slice(4)}`);
      mkdirSync(output);
      mkdirSync(temporaryRoot);
      const tarball = stageDirectNpmTarball({
        root,
        seedTarball: makeSeed(root, testCase.name, testCase.license),
        outputDirectory: output,
        temporaryRoot,
        expectedName: testCase.name,
        expectedLicense: testCase.license,
      });
      const files = archiveFiles(tarball);
      const legalNames = files.filter((path) => /^(?:LICENSE|NOTICE)/u.test(path));
      assert.deepEqual(legalNames, Object.keys(testCase.expected).sort());
      for (const [path, content] of Object.entries(testCase.expected)) {
        assert.equal(archiveBytes(tarball, path).toString("utf8"), content);
      }
      assertDirectLegalPayload({
        tarball,
        files,
        root,
        expectedName: testCase.name,
        expectedLicense: testCase.license,
        readBytes: archiveBytes,
      });
    }
  });

  it("rejects a present legal file whose bytes differ from canonical source", () => {
    const root = fixtureRoot();
    assert.throws(
      () =>
        assertDirectLegalPayload({
          tarball: "fake.tgz",
          files: ["package.json", "LICENSE", "NOTICE"],
          root,
          expectedName: "@tc/apache",
          expectedLicense: "Apache-2.0",
          readBytes: (_tarball, path) =>
            Buffer.from(path === "LICENSE" ? "wrong but present\n" : "canonical notice\n"),
        }),
      /LICENSE does not byte-match canonical source/,
    );
  });
});

describe("tab legal boundary", () => {
  it("compares every packaged legal file to its canonical source bytes", () => {
    const root = fixtureRoot();
    const packageRoot = join(root, "tab-archive/package");
    for (const [path, source] of [
      ["LICENSE", join(root, "LICENSE")],
      ["NOTICE", join(root, "NOTICE")],
      [
        "THIRD_PARTY_LICENSES.txt",
        join(root, "packages/tab/native-release/THIRD_PARTY_LICENSES.txt"),
      ],
    ]) {
      write(join(packageRoot, path), readFileSync(source));
    }
    const tarball = join(root, "tab.tgz");
    run("tar", ["-czf", tarball, "-C", join(root, "tab-archive"), "package"]);
    const files = archiveFiles(tarball);
    assert.doesNotThrow(() => assertPackedTabLegalPayload(tarball, files, root));

    write(join(root, "NOTICE"), "changed canonical notice\n");
    assert.throws(
      () => assertPackedTabLegalPayload(tarball, files, root),
      /NOTICE does not byte-match canonical source/,
    );
  });
});
