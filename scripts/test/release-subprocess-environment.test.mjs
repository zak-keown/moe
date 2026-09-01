import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createReleaseSubprocessEnvironment } from "../release-subprocess-environment.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function privateNpmrc() {
  const directory = mkdtempSync(join(tmpdir(), "moe-release-env-"));
  temporaryDirectories.push(directory);
  const path = join(directory, ".npmrc");
  writeFileSync(path, "always-auth=true\n", { mode: 0o600 });
  return path;
}

describe("createReleaseSubprocessEnvironment", () => {
  it("preserves the small cross-platform runtime surface release commands need", () => {
    const safe = createReleaseSubprocessEnvironment({
      PATH: "/usr/local/bin:/usr/bin:/bin",
      TMPDIR: "/tmp/release/",
      LANG: "en_US.UTF-8",
      LC_ALL: "C.UTF-8",
      TZ: "UTC",
      SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
      NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/tc.pem",
      SDKROOT: "/Applications/Xcode.app/SDKs/MacOSX.sdk",
      MACOSX_DEPLOYMENT_TARGET: "13.0",
    });

    assert.deepEqual(safe, {
      LANG: "en_US.UTF-8",
      LC_ALL: "C.UTF-8",
      MACOSX_DEPLOYMENT_TARGET: "13.0",
      NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/tc.pem",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      SDKROOT: "/Applications/Xcode.app/SDKs/MacOSX.sdk",
      SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
      TMPDIR: "/tmp/release/",
      TZ: "UTC",
    });
  });

  it("does not inherit home, identity, or build-routing variables", () => {
    const unsafeAmbient = {
      HOME: "/home/release",
      USER: "release",
      LOGNAME: "release",
      CARGO_HOME: "/home/release/.cargo",
      CARGO_BUILD_TARGET: "malicious-target",
      CARGO_TARGET_DIR: "/tmp/untrusted-target",
      CARGO_NET_OFFLINE: "false",
      RUSTUP_HOME: "/home/release/.rustup",
      RUSTUP_TOOLCHAIN: "untrusted-toolchain",
      SOURCE_DATE_EPOCH: "999",
    };

    const safe = createReleaseSubprocessEnvironment({ PATH: "/usr/bin", ...unsafeAmbient });

    assert.deepEqual(safe, { PATH: "/usr/bin" });
    for (const name of Object.keys(unsafeAmbient)) {
      assert.equal(Object.hasOwn(safe, name), false, `${name} was inherited`);
    }
  });

  it("drops known and novel credential-shaped ambient variables by construction", () => {
    const secrets = {
      PROGET_NPM_AUTH: "proget-secret",
      CI_JOB_TOKEN: "gitlab-job-secret",
      TC_GITLAB_TOKEN: "gitlab-api-secret",
      GITHUB_TOKEN: "github-secret",
      GLAB_TOKEN: "glab-secret",
      NPM_TOKEN: "npm-secret",
      NODE_AUTH_TOKEN: "node-secret",
      npm_config_authToken: "lowercase-npm-secret",
      NPM_CONFIG__AUTH: "npm-basic-secret",
      NPM_CONFIG_USERCONFIG: "/tmp/ambient-secret-npmrc",
      SSH_AUTH_SOCK: "/tmp/agent.sock",
      AWS_ACCESS_KEY_ID: "access-key",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      AWS_SESSION_TOKEN: "aws-session-secret",
      AZURE_CLIENT_SECRET: "azure-secret",
      GOOGLE_APPLICATION_CREDENTIALS: "/tmp/google-secret.json",
      DATABASE_PASSWORD: "database-secret",
      SIGNING_PRIVATE_KEY: "private-key",
      FUTURE_REGISTRY_CREDENTIAL: "unknown-future-secret",
      TOTALLY_NEW_AUTH_MATERIAL: "novel-auth-secret",
      INTERNAL_COOKIE: "cookie-secret",
      HTTP_PROXY: "https://user:password@proxy.example",
    };

    const safe = createReleaseSubprocessEnvironment({ PATH: "/usr/bin", ...secrets });

    assert.deepEqual(safe, { PATH: "/usr/bin" });
    for (const [name, value] of Object.entries(secrets)) {
      assert.equal(Object.hasOwn(safe, name), false, `${name} was inherited`);
      assert.equal(Object.values(safe).includes(value), false, `${name} value leaked`);
    }
  });

  it("accepts only controlled explicit additions", () => {
    const safe = createReleaseSubprocessEnvironment(
      { PATH: "/usr/bin", CI_JOB_TOKEN: "secret" },
      {
        CARGO_HOME: "/tmp/isolated-cargo",
        CARGO_NET_OFFLINE: "true",
        MOE_TAB_LIB: "/tmp/libmoe_tab_ffi.so",
        NPM_CONFIG_IGNORE_SCRIPTS: "true",
        RUSTUP_HOME: "/tmp/isolated-rustup",
        SOURCE_DATE_EPOCH: "0",
      },
    );

    assert.deepEqual(safe, {
      CARGO_HOME: "/tmp/isolated-cargo",
      CARGO_NET_OFFLINE: "true",
      PATH: "/usr/bin",
      MOE_TAB_LIB: "/tmp/libmoe_tab_ffi.so",
      NPM_CONFIG_IGNORE_SCRIPTS: "true",
      RUSTUP_HOME: "/tmp/isolated-rustup",
      SOURCE_DATE_EPOCH: "0",
    });
    assert.throws(
      () => createReleaseSubprocessEnvironment({}, { CI_JOB_TOKEN: "secret" }),
      /addition is not allowlisted: CI_JOB_TOKEN/u,
    );
    assert.throws(
      () => createReleaseSubprocessEnvironment({}, { FUTURE_SERVICE_SESSION: "secret" }),
      /addition is not allowlisted: FUTURE_SERVICE_SESSION/u,
    );
    assert.throws(
      () => createReleaseSubprocessEnvironment({}, { HOME: "/home/release" }),
      /addition is not allowlisted: HOME/u,
    );
  });

  it("accepts an absolute regular 0600 npm userconfig after sanitization", () => {
    const npmrc = privateNpmrc();
    const safe = createReleaseSubprocessEnvironment(
      {
        PATH: "/usr/bin",
        NPM_CONFIG_USERCONFIG: "/home/release/.npmrc",
        PROGET_NPM_AUTH: "secret",
      },
      { NPM_CONFIG_USERCONFIG: npmrc },
    );

    assert.deepEqual(safe, { PATH: "/usr/bin", NPM_CONFIG_USERCONFIG: npmrc });
  });

  it("rejects unsafe npm userconfig additions", () => {
    const npmrc = privateNpmrc();
    chmodSync(npmrc, 0o644);
    assert.throws(
      () => createReleaseSubprocessEnvironment({}, { NPM_CONFIG_USERCONFIG: npmrc }),
      /must have mode 0600/u,
    );
    assert.throws(
      () => createReleaseSubprocessEnvironment({}, { NPM_CONFIG_USERCONFIG: "relative/.npmrc" }),
      /must be an absolute path/u,
    );

    const symlink = join(temporaryDirectories[0], "npmrc-link");
    symlinkSync(npmrc, symlink);
    assert.throws(
      () => createReleaseSubprocessEnvironment({}, { NPM_CONFIG_USERCONFIG: symlink }),
      /must be a regular file/u,
    );
  });

  it("rejects non-string and null-byte values rather than coercing them", () => {
    assert.throws(
      () => createReleaseSubprocessEnvironment({ PATH: 42 }),
      /environment\.PATH must be a string/u,
    );
    assert.throws(
      () => createReleaseSubprocessEnvironment({ PATH: "/usr/bin\0secret" }),
      /must not contain a null byte/u,
    );
    assert.throws(
      () => createReleaseSubprocessEnvironment({}, { NPM_CONFIG_OFFLINE: true }),
      /additions\.NPM_CONFIG_OFFLINE must be a string/u,
    );
  });
});
