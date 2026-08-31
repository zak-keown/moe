import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "vitest";
import { resolveProjectPrompt } from "../../../src/qa/runs/orchestrator.js";

describe("resolveProjectPrompt", () => {
  test("returns explicit path contents when provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "moe-flight-pp-"));
    try {
      const explicit = join(dir, "extra.md");
      writeFileSync(explicit, "EXPLICIT_BODY", "utf-8");
      expect(resolveProjectPrompt(dir, ".moe-flight", explicit)).toBe("EXPLICIT_BODY");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("auto-loads .moe-flight/project.md when no explicit path", () => {
    const dir = mkdtempSync(join(tmpdir(), "moe-flight-pp-"));
    try {
      mkdirSync(join(dir, ".moe-flight"));
      writeFileSync(join(dir, ".moe-flight", "project.md"), "DEFAULT_BODY", "utf-8");
      expect(resolveProjectPrompt(dir, ".moe-flight", undefined)).toBe("DEFAULT_BODY");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns undefined when no explicit path and no default file", () => {
    const dir = mkdtempSync(join(tmpdir(), "moe-flight-pp-"));
    try {
      expect(resolveProjectPrompt(dir, ".moe-flight", undefined)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when explicit path is supplied but file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "moe-flight-pp-"));
    try {
      const explicit = join(dir, "nonexistent.md");
      expect(() => resolveProjectPrompt(dir, ".moe-flight", explicit)).toThrow(/nonexistent\.md/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
