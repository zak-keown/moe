import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureStatusLine } from "../src/hooks/ensure-statusline.js";

describe("ensureStatusLine", () => {
  let dir: string;
  let settingsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "moe-statusline-test-"));
    settingsPath = join(dir, "settings.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes statusLine when settings.json does not exist", () => {
    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: true, reason: "written" });
    const written = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(written.statusLine).toEqual({
      type: "command",
      command: 'node "/plugin/vendor/ccstatusline/ccstatusline.js"',
      padding: 0,
    });
  });

  it("writes statusLine when settings.json exists but has no statusLine key, preserving other keys", () => {
    writeFileSync(settingsPath, JSON.stringify({ someOtherSetting: true }));

    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: true, reason: "written" });
    const written = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(written.someOtherSetting).toBe(true);
    expect(written.statusLine).toBeDefined();
  });

  it("never overwrites an existing statusLine", () => {
    const existing = { statusLine: { type: "command", command: "my-own-statusline" } };
    writeFileSync(settingsPath, JSON.stringify(existing));

    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: false, reason: "already-set" });
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual(existing);
  });

  it("is idempotent across repeated calls", () => {
    ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });
    const afterFirst = readFileSync(settingsPath, "utf8");

    const second = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(second).toEqual({ wrote: false, reason: "already-set" });
    expect(readFileSync(settingsPath, "utf8")).toBe(afterFirst);
  });

  it("treats an unparseable settings.json as unreadable and does not write", () => {
    writeFileSync(settingsPath, "{ not valid json");

    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: false, reason: "unreadable-settings" });
    expect(readFileSync(settingsPath, "utf8")).toBe("{ not valid json");
  });

  it("treats a settings.json whose top level is not an object as unreadable and does not write", () => {
    writeFileSync(settingsPath, JSON.stringify(["not", "an", "object"]));

    const result = ensureStatusLine({
      settingsPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: false, reason: "unreadable-settings" });
  });

  it("creates parent directories that do not yet exist", () => {
    const nestedPath = join(dir, "nested", "deeper", "settings.json");

    const result = ensureStatusLine({
      settingsPath: nestedPath,
      vendoredScriptPath: "/plugin/vendor/ccstatusline/ccstatusline.js",
    });

    expect(result).toEqual({ wrote: true, reason: "written" });
    expect(JSON.parse(readFileSync(nestedPath, "utf8")).statusLine).toBeDefined();
  });
});
