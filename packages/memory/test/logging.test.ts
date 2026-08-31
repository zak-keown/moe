import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatLogLine, getLogDir, getSyncLogPath } from "../src/logging.js";

describe("diagnostic logging paths", () => {
  let testDir: string | undefined;
  const originalConfigDir = process.env.MOE_MEMORY_CONFIG_DIR;

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.MOE_MEMORY_CONFIG_DIR;
    else process.env.MOE_MEMORY_CONFIG_DIR = originalConfigDir;
    if (testDir) rmSync(testDir, { recursive: true, force: true });
    testDir = undefined;
  });

  it("stores hook and background sync logs under the memory config directory", () => {
    testDir = mkdtempSync(join(tmpdir(), "em-logs-"));
    process.env.MOE_MEMORY_CONFIG_DIR = testDir;

    expect(getLogDir()).toBe(join(testDir, "logs"));
    expect(getSyncLogPath()).toBe(join(testDir, "logs", "moe-memory.log"));
  });

  it("formats log lines with timestamp, level, and message", () => {
    const line = formatLogLine("error", "Codex hook failed");

    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z \[error\] Codex hook failed\n$/);
  });
});
