import { lstatSync } from "node:fs";
import { isAbsolute } from "node:path";

/**
 * Ambient variables release subprocesses may inherit.
 *
 * This is intentionally an exact allowlist. Release commands do not inherit a
 * variable merely because its name is unfamiliar or does not currently look
 * secret. Additions to this list are therefore security-sensitive.
 */
export const RELEASE_SUBPROCESS_AMBIENT_KEYS = Object.freeze([
  "DEVELOPER_DIR",
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
  "MACOSX_DEPLOYMENT_TARGET",
  "NODE_EXTRA_CA_CERTS",
  "PATH",
  "SDKROOT",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
]);

/**
 * Variables that callers may add deliberately after ambient sanitization.
 * These cover the release tools' offline and staging inputs without opening a
 * generic escape hatch for novel credentials.
 */
export const RELEASE_SUBPROCESS_ADDITION_KEYS = Object.freeze([
  ...RELEASE_SUBPROCESS_AMBIENT_KEYS,
  "CARGO_BUILD_TARGET",
  "CARGO_HOME",
  "CARGO_NET_OFFLINE",
  "CARGO_TARGET_DIR",
  "MOE_TAB_LIB",
  "NPM_CONFIG_CACHE",
  "NPM_CONFIG_IGNORE_SCRIPTS",
  "NPM_CONFIG_OFFLINE",
  "NPM_CONFIG_USERCONFIG",
  "RUSTUP_HOME",
  "RUSTUP_TOOLCHAIN",
  "SOURCE_DATE_EPOCH",
]);

const additionKeys = new Set(RELEASE_SUBPROCESS_ADDITION_KEYS);

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertEnvironmentValue(value, label) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  if (value.includes("\0")) {
    throw new TypeError(`${label} must not contain a null byte`);
  }
}

function assertPrivateNpmUserConfig(path) {
  if (!isAbsolute(path)) {
    throw new TypeError("NPM_CONFIG_USERCONFIG must be an absolute path");
  }
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw new TypeError(`NPM_CONFIG_USERCONFIG is not readable: ${error.message}`);
  }
  if (!stat.isFile()) {
    throw new TypeError("NPM_CONFIG_USERCONFIG must be a regular file, not a symlink or directory");
  }
  if ((stat.mode & 0o777) !== 0o600) {
    throw new TypeError("NPM_CONFIG_USERCONFIG must have mode 0600");
  }
}

/**
 * Build an environment for a release subprocess from an exact allowlist.
 *
 * `additions` is also allowlisted. The publisher may provide its ephemeral
 * npmrc as `NPM_CONFIG_USERCONFIG`; that file must already exist as a regular
 * 0600 file. Ambient npm configuration is never inherited.
 */
export function createReleaseSubprocessEnvironment(environment = process.env, additions = {}) {
  assertRecord(environment, "environment");
  assertRecord(additions, "additions");

  const safe = {};
  for (const key of RELEASE_SUBPROCESS_AMBIENT_KEYS) {
    const value = environment[key];
    if (value === undefined) continue;
    assertEnvironmentValue(value, `environment.${key}`);
    safe[key] = value;
  }

  for (const [key, value] of Object.entries(additions)) {
    if (!additionKeys.has(key)) {
      throw new TypeError(`release subprocess addition is not allowlisted: ${key}`);
    }
    assertEnvironmentValue(value, `additions.${key}`);
    if (key === "NPM_CONFIG_USERCONFIG") assertPrivateNpmUserConfig(value);
    safe[key] = value;
  }

  return safe;
}
