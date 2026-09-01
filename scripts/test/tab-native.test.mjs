import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  inspectTabNativeBytes,
  stageTabNpmPackage,
  TAB_NATIVE_TARGETS,
  validateTabNativeMatrix,
} from "../tab-native.mjs";

const VERSION = "1.2.3-tc.4";
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function nativeBytes(target) {
  const bytes = Buffer.alloc(32);
  if (target.family === "darwin") {
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(target.machine, 4);
    bytes.writeUInt32LE(6, 12);
  } else {
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
    bytes.writeUInt16LE(3, 16);
    bytes.writeUInt16LE(target.machine, 18);
  }
  return bytes;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "moe-tab-native-test-"));
  roots.push(root);
  write(join(root, "LICENSE"), "license\n");
  write(join(root, "NOTICE"), "notice\n");
  write(join(root, "packages/tab/native-release/THIRD_PARTY_LICENSES.txt"), "third party\n");
  write(
    join(root, "packages/tab/bindings/typescript/package.json"),
    `${JSON.stringify({ name: "@tc/moe-tab", version: VERSION })}\n`,
  );
  write(join(root, "packages/tab/bindings/typescript/README.md"), "readme\n");
  write(join(root, "packages/tab/bindings/typescript/dist/index.js"), "export {};\n");

  const artifacts = {};
  for (const target of TAB_NATIVE_TARGETS) {
    const bytes = nativeBytes(target);
    const base =
      target.family === "darwin"
        ? join(root, "packages/tab/native-release")
        : join(root, ".tc-tab-native");
    write(join(base, target.id, target.filename), bytes);
    if (target.family === "darwin") {
      artifacts[target.id] = {
        path: `${target.id}/${target.filename}`,
        rustTarget: target.rustTarget,
        version: VERSION,
        sha256: sha256(bytes),
      };
    }
  }
  write(
    join(root, "packages/tab/native-release/manifest.json"),
    `${JSON.stringify({ schema: 1, provenance: "apple-hardware", artifacts })}\n`,
  );
  return root;
}

function successfulRunner(version = VERSION) {
  const calls = [];
  return {
    calls,
    runCommand(command, args, options) {
      calls.push({ command, args, options });
      if (command === "git") return { status: 0, stdout: `${args.at(-1)}\n`, stderr: "" };
      if (command === process.execPath) return { status: 0, stdout: `${version}\n`, stderr: "" };
      throw new Error(`unexpected command ${command}`);
    },
  };
}

describe("tab native matrix", () => {
  it("recognizes only the exact thin Mach-O and ELF architectures", () => {
    for (const target of TAB_NATIVE_TARGETS) {
      const inspected = inspectTabNativeBytes(nativeBytes(target), target);
      assert.equal(inspected.target, target.id);
      assert.equal(inspected.bytes, 32);
    }

    const linuxArm64 = TAB_NATIVE_TARGETS.find((target) => target.id === "linux-arm64");
    const wrongMachine = nativeBytes(linuxArm64);
    wrongMachine.writeUInt16LE(62, 18);
    assert.throws(
      () => inspectTabNativeBytes(wrongMachine, linuxArm64),
      /ELF machine does not match arm64/,
    );
    assert.throws(
      () => inspectTabNativeBytes(Buffer.from("not a binary"), linuxArm64),
      /not a little-endian ELF64/,
    );
  });

  it("validates tracked Apple hashes, all four headers, and the executable host version", () => {
    const root = fixture();
    const runner = successfulRunner();
    const matrix = validateTabNativeMatrix({
      root,
      releaseVersion: VERSION,
      runCommand: runner.runCommand,
    });

    assert.equal(matrix.files.size, 4);
    assert.equal(matrix.executed.version, VERSION);
    assert.equal(runner.calls[0].command, "git");
    assert.match(runner.calls[0].args.join(" "), /darwin-arm64\/libmoe_tab_ffi\.dylib/);
    assert.equal(runner.calls[1].command, process.execPath);
    assert.equal(runner.calls[1].options.env.PROGET_NPM_AUTH, undefined);
  });

  it("stages an exact four-platform package with current legal payloads", () => {
    const root = fixture();
    const runner = successfulRunner();
    const matrix = validateTabNativeMatrix({
      root,
      releaseVersion: VERSION,
      runCommand: runner.runCommand,
    });
    const output = join(root, "stage");
    stageTabNpmPackage({ root, destination: output, matrix });

    for (const path of ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.txt", "dist/index.js"]) {
      assert.equal(existsSync(join(output, path)), true, path);
    }
    for (const target of TAB_NATIVE_TARGETS) {
      assert.deepEqual(
        readFileSync(join(output, "native", target.id, target.filename)),
        nativeBytes(target),
      );
      assert.equal(
        statSync(join(output, "native", target.id, target.filename)).mode & 0o777,
        0o644,
      );
    }
  });

  it("fails closed on hash drift, untracked Apple inputs, and version drift", () => {
    const root = fixture();
    const manifestPath = join(root, "packages/tab/native-release/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts["darwin-x64"].sha256 = "0".repeat(64);
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    assert.throws(
      () =>
        validateTabNativeMatrix({
          root,
          releaseVersion: VERSION,
          runCommand: successfulRunner().runCommand,
        }),
      /darwin-x64 does not match its tracked Apple manifest/,
    );

    const clean = fixture();
    assert.throws(
      () =>
        validateTabNativeMatrix({
          root: clean,
          releaseVersion: VERSION,
          runCommand: () => ({ status: 1, stdout: "", stderr: "not tracked" }),
        }),
      /verify tracked Apple native payloads failed/,
    );
    assert.throws(
      () =>
        validateTabNativeMatrix({
          root: clean,
          releaseVersion: VERSION,
          runCommand: successfulRunner("wrong-version").runCommand,
        }),
      /reports "wrong-version"/,
    );
  });
});
