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
  TAB_DARWIN_INSTALL_NAME,
  TAB_NATIVE_ABI_EXPORTS,
  TAB_NATIVE_TARGETS,
  validateTabNativeMatrix,
} from "../tab-native.mjs";

const VERSION = "1.2.3-tc.4";
const LICENSE_INPUT = "e".repeat(64);
const LICENSE_PAYLOAD = `License inputs SHA-256: ${LICENSE_INPUT}\nthird party\n`;
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

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function nativeBytes(target) {
  const bytes = Buffer.alloc(target.family === "darwin" ? 512 : 32);
  if (target.family === "darwin") {
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(target.machine, 4);
    bytes.writeUInt32LE(6, 12);
    const name = Buffer.from(`${TAB_DARWIN_INSTALL_NAME}\0`);
    const commandSize = Math.ceil((24 + name.length) / 8) * 8;
    bytes.writeUInt32LE(1, 16);
    bytes.writeUInt32LE(commandSize, 20);
    bytes.writeUInt32LE(0x0d, 32);
    bytes.writeUInt32LE(commandSize, 36);
    bytes.writeUInt32LE(24, 40);
    name.copy(bytes, 56);
    let symbolOffset = 32 + commandSize;
    for (const symbol of TAB_NATIVE_ABI_EXPORTS) {
      symbolOffset += bytes.write(`_${symbol}\0`, symbolOffset);
    }
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

function assertSecretFree(environment) {
  for (const [name, value] of Object.entries(SECRET_ENVIRONMENT)) {
    assert.equal(Object.hasOwn(environment, name), false, `${name} survived sanitization`);
    assert.equal(Object.values(environment).includes(value), false, `${name} value leaked`);
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "moe-tab-native-test-"));
  roots.push(root);
  write(join(root, "LICENSE"), "license\n");
  write(join(root, "NOTICE"), "notice\n");
  write(join(root, "packages/tab/native-release/THIRD_PARTY_LICENSES.txt"), LICENSE_PAYLOAD);
  write(join(root, "packages/tab/Cargo.toml"), "workspace\n");
  write(join(root, "packages/tab/Cargo.lock"), "lock\n");
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
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    }
  }
  write(
    join(root, "packages/tab/native-release/manifest.json"),
    `${JSON.stringify({
      schema: 2,
      provenance: "apple-hardware",
      source: {
        commit: "a".repeat(40),
        cratesTree: "b".repeat(40),
        cargoManifestSha256: sha256("workspace\n"),
        cargoLockSha256: sha256("lock\n"),
      },
      builder: {
        rustc: { version: "1.98.0", commit: "c".repeat(40) },
        cargo: { version: "1.98.0", commit: "d".repeat(40) },
        apple: { sdk: "macosx26.5", clang: "Apple clang 21", linker: "ld-1267" },
      },
      build: {
        profile: "release",
        locked: true,
        cargoIncremental: false,
        installName: TAB_DARWIN_INSTALL_NAME,
        rustFlags: [
          "--remap-path-prefix=<repository-root>=/source/moe",
          "--remap-path-prefix=<cargo-home>=/cargo",
          "--remap-path-prefix=<build-root>=/build",
        ],
        postLink: [
          "install_name_tool -id @rpath/libmoe_tab_ffi.dylib <artifact>",
          "strip -x <artifact>",
        ],
      },
      licenses: {
        path: "THIRD_PARTY_LICENSES.txt",
        inputSha256: LICENSE_INPUT,
        payloadSha256: sha256(LICENSE_PAYLOAD),
      },
      artifacts,
    })}\n`,
  );
  return root;
}

function successfulRunner(version = VERSION, { workingHash = "f".repeat(40) } = {}) {
  const calls = [];
  return {
    calls,
    runCommand(command, args, options) {
      calls.push({ command, args, options });
      assertSecretFree(options.env);
      if (command === "git") {
        const operation = args[2];
        if (operation === "ls-files") {
          const paths = args.slice(args.indexOf("--") + 1);
          return {
            status: 0,
            stdout: paths.map((path) => `100644 ${"f".repeat(40)} 0\t${path}`).join("\n"),
            stderr: "",
          };
        }
        if (operation === "hash-object") {
          const paths = args.slice(args.indexOf("--") + 1);
          return { status: 0, stdout: paths.map(() => workingHash).join("\n"), stderr: "" };
        }
        if (operation === "rev-parse") {
          return { status: 0, stdout: `${"b".repeat(40)}\n`, stderr: "" };
        }
        if (operation === "show") {
          const path = args.at(-1);
          return {
            status: 0,
            stdout: Buffer.from(path.endsWith("Cargo.toml") ? "workspace\n" : "lock\n"),
            stderr: Buffer.alloc(0),
          };
        }
      }
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
      assert.equal(inspected.bytes, target.family === "darwin" ? 512 : 32);
      if (target.family === "darwin") assert.equal(inspected.installName, TAB_DARWIN_INSTALL_NAME);
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

    const darwin = TAB_NATIVE_TARGETS.find((target) => target.id === "darwin-arm64");
    const absoluteId = nativeBytes(darwin);
    absoluteId[absoluteId.indexOf(Buffer.from(TAB_DARWIN_INSTALL_NAME))] = "X".charCodeAt(0);
    assert.throws(() => inspectTabNativeBytes(absoluteId, darwin), /relocatable LC_ID_DYLIB/);

    const pathLeak = nativeBytes(darwin);
    pathLeak.write("/Users/build-agent/source", 400);
    assert.throws(() => inspectTabNativeBytes(pathLeak, darwin), /embeds forbidden build path/);

    const missingExport = nativeBytes(darwin);
    missingExport[missingExport.indexOf(Buffer.from("_moe_tab_version\0"))] = "X".charCodeAt(0);
    assert.throws(() => inspectTabNativeBytes(missingExport, darwin), /missing C ABI export/);
  });

  it("validates tracked Apple hashes, all four headers, and the executable host version", () => {
    const root = fixture();
    const runner = successfulRunner();
    const matrix = validateTabNativeMatrix({
      root,
      releaseVersion: VERSION,
      runCommand: runner.runCommand,
      env: { ...process.env, ...SECRET_ENVIRONMENT },
    });

    assert.equal(matrix.files.size, 4);
    assert.equal(matrix.executed.version, VERSION);
    assert.equal(runner.calls[0].command, "git");
    assert.match(runner.calls[0].args.join(" "), /darwin-arm64\/libmoe_tab_ffi\.dylib/);
    assert.equal(runner.calls.at(-1).command, process.execPath);
    assert.equal(runner.calls.at(-1).options.env.PROGET_NPM_AUTH, undefined);
    assert.equal(
      runner.calls.at(-1).options.env.MOE_TAB_LIB.endsWith("libmoe_tab_ffi.dylib"),
      true,
    );
  });

  it("stages an exact four-platform package with current legal payloads", () => {
    const root = fixture();
    const runner = successfulRunner();
    const matrix = validateTabNativeMatrix({
      root,
      releaseVersion: VERSION,
      runCommand: runner.runCommand,
      env: { ...process.env, ...SECRET_ENVIRONMENT },
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
      /read tracked Apple index entries failed/,
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

    const indexDrift = fixture();
    assert.throws(
      () =>
        validateTabNativeMatrix({
          root: indexDrift,
          releaseVersion: VERSION,
          runCommand: successfulRunner(VERSION, { workingHash: "0".repeat(40) }).runCommand,
        }),
      /working bytes do not equal their Git index blobs/,
    );

    const legalDrift = fixture();
    writeFileSync(
      join(legalDrift, "packages/tab/native-release/THIRD_PARTY_LICENSES.txt"),
      `${LICENSE_PAYLOAD}tampered\n`,
    );
    assert.throws(
      () =>
        validateTabNativeMatrix({
          root: legalDrift,
          releaseVersion: VERSION,
          runCommand: successfulRunner().runCommand,
        }),
      /license payload does not match its manifest/,
    );
  });
});
