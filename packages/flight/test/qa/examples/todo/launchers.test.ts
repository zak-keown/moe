import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const PACKAGE_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const launchers = ["run-tui.sh", "run-web.sh"];
const scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe.each(launchers)("%s", (launcher) => {
  test("resolves the tsx loader from the package when called from another cwd", () => {
    const callerDir = mkdtempSync(join(tmpdir(), "moe-flight-launcher-cwd-"));
    const binDir = mkdtempSync(join(tmpdir(), "moe-flight-launcher-bin-"));
    scratchDirs.push(callerDir, binDir);

    const capture = join(binDir, "node-invocation.txt");
    const fakeNode = join(binDir, "node");
    writeFileSync(fakeNode, '#!/bin/sh\npwd > "$CAPTURE"\nprintf "%s\\n" "$@" >> "$CAPTURE"\n');
    chmodSync(fakeNode, 0o755);

    const result = spawnSync("bash", [join(PACKAGE_ROOT, "examples", "todo", launcher)], {
      cwd: callerDir,
      env: {
        ...process.env,
        CAPTURE: capture,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      },
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    const [nodeCwd, importFlag, loader, entrypoint] = readFileSync(capture, "utf8")
      .trim()
      .split("\n");
    expect(nodeCwd).toBe(PACKAGE_ROOT);
    expect(importFlag).toBe("--import");
    expect(loader).toBe("tsx");
    expect(entrypoint).toMatch(/\/examples\/todo\/(tui\.tsx|web\/server\.ts)$/);
  });
});
