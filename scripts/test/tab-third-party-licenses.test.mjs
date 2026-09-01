import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  checkLicenseInputs,
  licenseInputFiles,
  licenseInputsDigest,
  linkedRegistryClosure,
  parseCargoLock,
  parseCrateArchive,
  RELEASE_TARGETS,
  renderThirdPartyLicenses,
  writeOrCheckPayload,
} from "../tab-third-party-licenses.mjs";

const SCRIPT = fileURLToPath(new URL("../tab-third-party-licenses.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const COMMITTED_PAYLOAD = fileURLToPath(
  new URL("../../packages/tab/native-release/THIRD_PARTY_LICENSES.txt", import.meta.url),
);
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeTarString(header, offset, length, value) {
  const encoded = Buffer.from(value);
  assert.ok(encoded.length <= length);
  encoded.copy(header, offset);
}

function tarEntry(path, content) {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  writeTarString(header, 0, 100, path);
  writeTarString(header, 100, 8, "0000644\0");
  writeTarString(header, 108, 8, "0000000\0");
  writeTarString(header, 116, 8, "0000000\0");
  writeTarString(header, 124, 12, `${body.length.toString(8).padStart(11, "0")}\0`);
  writeTarString(header, 136, 12, "00000000000\0");
  header.fill(32, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeTarString(header, 257, 6, "ustar\0");
  writeTarString(header, 263, 2, "00");
  const checksum = [...header].reduce((total, byte) => total + byte, 0);
  writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

function crateArchive(crate, files) {
  const entries = Object.entries(files)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([path, content]) => tarEntry(`${crate}/${path}`, content));
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]), { mtime: 0 });
}

function registryFixture({
  name = "dual-license",
  version = "1.2.3",
  license = "MIT OR Apache-2.0",
  files = {
    "Cargo.toml": '[package]\nname = "dual-license"\n',
    "LICENSE-APACHE": "APACHE TERMS\n",
  },
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "moe-tab-licenses-"));
  roots.push(root);
  const crate = `${name}-${version}`;
  const index = "test-index";
  const sourceRoot = join(root, "registry", "src", index, crate);
  const cacheRoot = join(root, "registry", "cache", index);
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(cacheRoot, { recursive: true });
  writeFileSync(join(sourceRoot, "Cargo.toml"), files["Cargo.toml"] ?? "[package]\n");
  const archive = crateArchive(crate, files);
  const archivePath = join(cacheRoot, `${crate}.crate`);
  writeFileSync(archivePath, archive);

  const source = "registry+https://github.com/rust-lang/crates.io-index";
  const dependencyId = `${source}#${name}@${version}`;
  const rootId = "path+file:///fixture#moe-tab-ffi@0.0.0";
  const dependency = {
    id: dependencyId,
    name,
    version,
    source,
    license,
    manifest_path: join(sourceRoot, "Cargo.toml"),
    targets: [{ kind: ["lib"] }],
  };
  const metadata = {
    packages: [
      {
        id: rootId,
        name: "moe-tab-ffi",
        version: "0.0.0",
        source: null,
        license: "Apache-2.0",
        manifest_path: join(root, "Cargo.toml"),
        targets: [{ kind: ["cdylib"] }],
      },
      dependency,
    ],
    resolve: {
      nodes: [
        {
          id: rootId,
          deps: [{ pkg: dependencyId, dep_kinds: [{ kind: null, target: null }] }],
        },
        { id: dependencyId, deps: [] },
      ],
    },
  };
  const metadataByTarget = new Map(RELEASE_TARGETS.map((target) => [target, metadata]));
  const lockText = `version = 4\n\n[[package]]\nname = "${name}"\nversion = "${version}"\nsource = "${source}"\nchecksum = "${sha256(archive)}"\n`;
  return {
    archivePath,
    dependency,
    inputDigest: "a".repeat(64),
    lockText,
    metadataByTarget,
    root,
  };
}

function inputFixture() {
  const root = mkdtempSync(join(tmpdir(), "moe-tab-license-inputs-"));
  roots.push(root);
  const files = [
    ["packages/tab/Cargo.lock", "lock\n"],
    ["packages/tab/Cargo.toml", "workspace\n"],
    ["packages/tab/crates/moe-tab-core/Cargo.toml", "core\n"],
    ["packages/tab/crates/moe-tab-ffi/Cargo.toml", "ffi\n"],
  ];
  for (const [path, content] of files) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content);
  }
  const digest = licenseInputsDigest(root);
  const output = join(root, "THIRD_PARTY_LICENSES.txt");
  writeFileSync(output, `License inputs SHA-256: ${digest}\n`);
  return { digest, files, output, root };
}

describe("Tab linked dependency closure", () => {
  it("uses normal edges and stops before procedural macros and dev dependencies", () => {
    const root = {
      id: "ffi",
      name: "moe-tab-ffi",
      source: null,
      targets: [{ kind: ["cdylib"] }],
    };
    const linked = {
      id: "linked",
      name: "linked",
      version: "1.0.0",
      source: "registry+test",
      targets: [{ kind: ["lib"] }],
    };
    const derive = {
      id: "derive",
      name: "derive",
      version: "1.0.0",
      source: "registry+test",
      targets: [{ kind: ["proc-macro"] }, { kind: ["test"] }],
    };
    const macroHelper = {
      id: "macro-helper",
      name: "macro-helper",
      version: "1.0.0",
      source: "registry+test",
      targets: [{ kind: ["lib"] }],
    };
    const dev = {
      id: "dev",
      name: "dev",
      version: "1.0.0",
      source: "registry+test",
      targets: [{ kind: ["lib"] }],
    };
    const metadata = {
      packages: [root, linked, derive, macroHelper, dev],
      resolve: {
        nodes: [
          {
            id: root.id,
            deps: [
              { pkg: linked.id, dep_kinds: [{ kind: null }] },
              { pkg: derive.id, dep_kinds: [{ kind: null }] },
              { pkg: dev.id, dep_kinds: [{ kind: "dev" }] },
            ],
          },
          { id: linked.id, deps: [] },
          { id: derive.id, deps: [{ pkg: macroHelper.id, dep_kinds: [{ kind: null }] }] },
          { id: macroHelper.id, deps: [] },
          { id: dev.id, deps: [] },
        ],
      },
    };

    assert.deepEqual(
      linkedRegistryClosure(metadata).map((pkg) => pkg.name),
      ["linked"],
    );
  });

  it("rejects duplicate package identities in Cargo.lock", () => {
    const entry = '[[package]]\nname = "same"\nversion = "1.0.0"\n';
    assert.throws(() => parseCargoLock(`${entry}\n${entry}`), /duplicate same@1\.0\.0/);
  });
});

describe("Tab third-party license payload", () => {
  it("renders byte-identically with checksums, target membership, and selected texts", () => {
    const fixture = registryFixture();
    const first = renderThirdPartyLicenses(fixture);
    const second = renderThirdPartyLicenses(fixture);

    assert.equal(first, second);
    assert.match(first, /Registry package instances: 1 \(1 unique names\)/);
    assert.match(first, /dual-license@1\.2\.3/);
    assert.match(first, /Selected license: Apache-2\.0/);
    assert.match(first, /aarch64-apple-darwin/);
    assert.match(first, /APACHE TERMS/);
    assert.match(first, new RegExp(sha256(fixture.lockText)));
  });

  it("fails when a cached crate does not match its Cargo.lock checksum", () => {
    const fixture = registryFixture();
    writeFileSync(fixture.archivePath, Buffer.from("tampered"));
    assert.throws(() => renderThirdPartyLicenses(fixture), /does not match Cargo\.lock/);
  });

  it("fails closed for a missing selected text or unsupported license expression", () => {
    const missing = registryFixture({ files: { "Cargo.toml": "[package]\n" } });
    assert.throws(() => renderThirdPartyLicenses(missing), /missing the source text/);

    const unsupported = registryFixture({ license: "MPL-2.0" });
    assert.throws(
      () => renderThirdPartyLicenses(unsupported),
      /unsupported SPDX expression MPL-2\.0/,
    );
  });

  it("requires locked metadata for every release target", () => {
    const fixture = registryFixture();
    fixture.metadataByTarget.delete("aarch64-apple-darwin");
    assert.throws(() => renderThirdPartyLicenses(fixture), /missing cargo metadata/);
  });

  it("detects missing and stale generated payloads in check mode", () => {
    const root = mkdtempSync(join(tmpdir(), "moe-tab-license-check-"));
    roots.push(root);
    const outputPath = join(root, "THIRD_PARTY_LICENSES.txt");

    assert.throws(
      () => writeOrCheckPayload({ outputPath, rendered: "expected\n", check: true, root }),
      /is missing/,
    );
    writeFileSync(outputPath, "stale\n");
    assert.throws(
      () => writeOrCheckPayload({ outputPath, rendered: "expected\n", check: true, root }),
      /is stale/,
    );
    writeOrCheckPayload({ outputPath, rendered: "expected\n", check: false, root });
    writeOrCheckPayload({ outputPath, rendered: "expected\n", check: true, root });
    assert.equal(readFileSync(outputPath, "utf8"), "expected\n");
  });

  it("hashes Cargo inputs in canonical path order", () => {
    const fixture = inputFixture();
    assert.deepEqual(licenseInputFiles(fixture.root), fixture.files.map(([path]) => path).sort());
    assert.equal(checkLicenseInputs(fixture).digest, fixture.digest);
  });

  it("fails the pure input check when Cargo.lock drifts", () => {
    const fixture = inputFixture();
    writeFileSync(join(fixture.root, "packages/tab/Cargo.lock"), "changed lock\n");
    assert.throws(() => checkLicenseInputs(fixture), /input digest is stale/);
  });

  it("fails the pure input check when a workspace Cargo.toml drifts", () => {
    const fixture = inputFixture();
    writeFileSync(
      join(fixture.root, "packages/tab/crates/moe-tab-ffi/Cargo.toml"),
      "changed manifest\n",
    );
    assert.throws(() => checkLicenseInputs(fixture), /input digest is stale/);
  });

  it("runs --check-inputs successfully with no Cargo executable", () => {
    const fixture = inputFixture();
    const run = spawnSync(
      process.execPath,
      [
        SCRIPT,
        "--check-inputs",
        "--root",
        fixture.root,
        "--output",
        fixture.output,
        "--cargo",
        join(fixture.root, "cargo-does-not-exist"),
      ],
      { encoding: "utf8" },
    );

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /inputs verified/);
  });

  it("runs --check through locked Cargo metadata and compares the complete rendered payload", () => {
    const fixture = registryFixture();
    for (const [path, content] of [
      ["packages/tab/Cargo.lock", fixture.lockText],
      ["packages/tab/Cargo.toml", "[workspace]\nmembers = []\n"],
      ["packages/tab/crates/fixture/Cargo.toml", '[package]\nname = "fixture"\n'],
    ]) {
      const absolute = join(fixture.root, path);
      mkdirSync(join(absolute, ".."), { recursive: true });
      writeFileSync(absolute, content);
    }

    const metadataPath = join(fixture.root, "metadata.json");
    const cargoLogPath = join(fixture.root, "cargo-targets.log");
    const fakeCargo = join(fixture.root, "cargo");
    const output = join(fixture.root, "THIRD_PARTY_LICENSES.txt");
    writeFileSync(metadataPath, JSON.stringify(fixture.metadataByTarget.values().next().value));
    writeFileSync(
      fakeCargo,
      `#!/usr/bin/env node
const fs = require("node:fs");
const targetFlag = process.argv.indexOf("--filter-platform");
if (targetFlag < 0 || !process.argv[targetFlag + 1]) process.exit(2);
fs.appendFileSync(${JSON.stringify(cargoLogPath)}, process.argv[targetFlag + 1] + "\\n");
process.stdout.write(fs.readFileSync(${JSON.stringify(metadataPath)}));
`,
    );
    chmodSync(fakeCargo, 0o755);
    writeFileSync(output, "stale but input-digest-shaped payload\n");

    const args = [
      SCRIPT,
      "--check",
      "--root",
      fixture.root,
      "--output",
      output,
      "--cargo",
      fakeCargo,
    ];
    const stale = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /is stale; regenerate and commit it/);

    const rendered = renderThirdPartyLicenses({
      metadataByTarget: fixture.metadataByTarget,
      lockText: fixture.lockText,
      inputDigest: licenseInputsDigest(fixture.root),
    });
    writeFileSync(output, rendered);
    const current = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(current.status, 0, current.stderr);
    assert.match(current.stdout, /1 package instances verified/);
    assert.deepEqual(readFileSync(cargoLogPath, "utf8").trim().split("\n"), [
      ...RELEASE_TARGETS,
      ...RELEASE_TARGETS,
    ]);
  });

  it("keeps the generator parseable on the Node 12.22 CI runtime", () => {
    const source = readFileSync(SCRIPT, "utf8");
    for (const unsupported of [/\?\?/, /\?\./, /\.at\(/, /\.replaceAll\(/]) {
      assert.doesNotMatch(source, unsupported);
    }
  });

  it("keeps the committed audited closure and exceptional bundled notices visible", () => {
    const payload = readFileSync(COMMITTED_PAYLOAD, "utf8");
    assert.ok(payload.includes(`License inputs SHA-256: ${licenseInputsDigest(REPO_ROOT)}`));
    assert.match(payload, /Registry package instances: 52 \(51 unique names\)/);
    assert.equal(payload.match(/^ {2}Cargo checksum: /gm)?.length, 52);
    for (const expected of [
      "Selected license: Apache-2.0 AND ISC + bundled Fiat/once_cell terms",
      "ring@0.17.14:LICENSE-BoringSSL",
      "ring@0.17.14:third_party/fiat/LICENSE",
      "ring@0.17.14:src/polyfill/once_cell/LICENSE-MIT",
      "memchr@2.8.3:COPYING",
      "ureq@2.12.1:src/chunked/LICENSE-APACHE",
      "utf8_iter@1.0.4:COPYRIGHT",
      "webpki-roots@0.26.11:LICENSE",
      "webpki-roots@1.0.9:LICENSE",
    ]) {
      assert.ok(payload.includes(expected), `missing ${expected}`);
    }
  });
});

describe("crate archive parser", () => {
  it("rejects truncated or non-gzip archives", () => {
    assert.throws(() => parseCrateArchive(Buffer.from("not gzip")), /invalid gzip/);
  });
});
